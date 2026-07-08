import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { VERSION } from "../tools/core/version";

const REPO_ROOT = resolve(import.meta.dir, "..");
const ELEGENT_BIN = join(REPO_ROOT, "dist/elgt");

/**
 * Task 26 驗收核心：對 `bun run build` 產出的編譯執行檔（`dist/elgt`）跑一輪端到端
 * 驗收，證明「免安裝 bun」也能完整使用 elgt——在一個乾淨的 temp dir 裡：
 *   1. `dist/elgt init` → 檢查產物（vault/CLAUDE.md/.mcp.json，command 為
 *      binary 絕對路徑、不含空白——代表 compiled 模式判斷正確，見 tools/lib/version.ts
 *      的 isCompiledRuntime）
 *   2. `dist/elgt lint <vault>` → 0 errors
 *   3. `dist/elgt version` → 印出 VERSION
 *   4. `dist/elgt mcp`（ELEGENT_VAULT 指向 temp vault）對 stdin 送 initialize
 *      JSON-RPC，驗證回傳合法的 initialize response
 *   5. `dist/elgt hook sessionstart`（CLAUDE_PROJECT_DIR=temp dir）→ 輸出含
 *      additionalContext
 *   6. `dist/elgt hook codex precompact`（CODEX_HOME=合成 rollout）→ 證明 Codex 整合
 *      （codex.ts + codex lib + codex-hooks.tmpl）真的打包進單一執行檔並能歸檔。dogfood
 *      的 `.codex/hooks.json` 走 `bun tools/hooks/codex.ts`（原始碼），完全不碰這條編譯
 *      路徑——所以這裡是唯一驗證「使用者手上那支 dist/elgt 能跑 Codex hook」的地方。
 *
 * 供 CI（release workflow）與人工（`bun run smoke`）共用；全部通過印 `SMOKE PASS`
 * 並以 exit 0 結束，任一步驟失敗印明確訊息並以 exit 1 結束。
 */

let failures = 0;

function ok(step: string, detail?: string): void {
  console.log(`ok   [${step}]${detail ? " " + detail : ""}`);
}

function fail(step: string, detail: string): void {
  failures++;
  console.error(`FAIL [${step}] ${detail}`);
}

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], opts: { cwd: string; env?: Record<string, string | undefined>; stdin?: string }): RunResult {
  const proc = Bun.spawnSync([ELEGENT_BIN, ...args], {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    stdin: opts.stdin !== undefined ? Buffer.from(opts.stdin) : undefined,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exitCode: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

/** 從 stream 讀到第一個換行為止的內容；逾時或 stream 提前關閉都視為失敗（拋出）。 */
async function readLine(stream: ReadableStream<Uint8Array>, timeoutMs: number): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const readLoop = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new Error("stream 在讀到換行前就關閉了");
      buf += decoder.decode(value, { stream: true });
      const idx = buf.indexOf("\n");
      if (idx !== -1) return buf.slice(0, idx);
    }
  })();
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`逾時（${timeoutMs}ms）未收到回應`)), timeoutMs));
  try {
    return await Promise.race([readLoop, timeout]);
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

function stepInit(tmp: string): void {
  const step = "init";
  const r = run(["init"], { cwd: tmp });
  if (r.exitCode !== 0) return fail(step, `exit code ${r.exitCode}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);

  const vaultDir = join(tmp, "vault");
  const claudeMd = join(tmp, "CLAUDE.md");
  const mcpJsonPath = join(tmp, ".mcp.json");
  if (!existsSync(vaultDir)) return fail(step, `${vaultDir} 不存在`);
  if (!existsSync(claudeMd)) return fail(step, `${claudeMd} 不存在`);
  if (!existsSync(mcpJsonPath)) return fail(step, `${mcpJsonPath} 不存在`);

  let mcpJson: { mcpServers?: Record<string, { command?: string; args?: string[] }> };
  try {
    mcpJson = JSON.parse(readFileSync(mcpJsonPath, "utf8"));
  } catch (err) {
    return fail(step, `.mcp.json 不是合法 JSON：${err instanceof Error ? err.message : String(err)}`);
  }
  const command = mcpJson.mcpServers?.["elegent-memory"]?.command;
  if (typeof command !== "string" || command.length === 0) return fail(step, ".mcp.json 缺少 mcpServers.elegent-memory.command");
  if (!command.startsWith("/")) return fail(step, `.mcp.json command 應為絕對路徑，實際是 "${command}"`);
  if (command.includes(" ")) return fail(step, `.mcp.json command 含空白（compiled 模式應是單一 binary 路徑）："${command}"`);
  if (!command.endsWith("/elgt")) return fail(step, `.mcp.json command 應指向 elgt binary 本身，實際是 "${command}"`);

  ok(step, `建立 ${vaultDir}、CLAUDE.md、.mcp.json（command=${command}）`);
}

function stepLint(tmp: string): void {
  const step = "lint";
  const r = run(["lint", join(tmp, "vault")], { cwd: tmp });
  if (r.exitCode !== 0) return fail(step, `exit code ${r.exitCode}（預期 0）\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  if (!r.stdout.includes("0 errors")) return fail(step, `stdout 未包含 "0 errors"：${r.stdout}`);
  ok(step, r.stdout.trim().split("\n").at(-1));
}

function stepVersion(tmp: string): void {
  const step = "version";
  const r = run(["version"], { cwd: tmp });
  if (r.exitCode !== 0) return fail(step, `exit code ${r.exitCode}`);
  const printed = r.stdout.trim();
  if (printed !== VERSION) return fail(step, `印出 "${printed}"，預期 "${VERSION}"`);
  ok(step, printed);
}

async function stepMcp(tmp: string): Promise<void> {
  const step = "mcp";
  const child = Bun.spawn([ELEGENT_BIN, "mcp"], {
    cwd: tmp,
    env: { ...process.env, ELEGENT_VAULT: join(tmp, "vault") },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    const req = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "elgt-smoke", version: "0.0.0" } },
    };
    child.stdin.write(JSON.stringify(req) + "\n");
    await child.stdin.flush();

    let line: string;
    try {
      line = await readLine(child.stdout, 10_000);
    } catch (err) {
      const stderrText = await new Response(child.stderr).text().catch(() => "");
      return fail(step, `${err instanceof Error ? err.message : String(err)}\nstderr: ${stderrText}`);
    }

    let parsed: { jsonrpc?: string; id?: number; result?: { protocolVersion?: string; serverInfo?: { name?: string; version?: string } } };
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      return fail(step, `回應不是合法 JSON：${line}`);
    }
    if (parsed.jsonrpc !== "2.0" || parsed.id !== 1 || !parsed.result) {
      return fail(step, `回應不是合法的 initialize response：${line}`);
    }
    if (parsed.result.serverInfo?.name !== "elegent-memory") {
      return fail(step, `serverInfo.name 非 "elegent-memory"：${line}`);
    }
    if (parsed.result.serverInfo?.version !== VERSION) {
      return fail(step, `serverInfo.version "${parsed.result.serverInfo?.version}" 與 VERSION "${VERSION}" 不一致：${line}`);
    }
    ok(step, `initialize response: ${line}`);
  } finally {
    child.kill();
  }
}

function stepHookSessionStart(tmp: string): void {
  const step = "hook claude sessionstart";
  const r = run(["hook", "claude", "sessionstart"], { cwd: tmp, env: { ...process.env, CLAUDE_PROJECT_DIR: tmp }, stdin: "{}\n" });
  if (r.exitCode !== 0) return fail(step, `exit code ${r.exitCode}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  if (!r.stdout.includes("additionalContext")) return fail(step, `stdout 未包含 "additionalContext"：${r.stdout}`);
  ok(step, r.stdout.trim());
}

/** 遞迴找第一個非 index.md 的歸檔檔（conversations 下 <project-slug>/<date>_<sid>.md）。 */
function findArchivedMd(dir: string): string | null {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findArchivedMd(full);
      if (found) return found;
    } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "index.md") {
      return full;
    }
  }
  return null;
}

function stepHookCodex(tmp: string): void {
  const step = "hook codex";
  // 合成一份 Codex rollout（session_meta.cwd=tmp，讓 findLatestCodexSessionFile 依 cwd 命中）。
  const codexHome = mkdtempSync(join(tmpdir(), "elgt-smoke-codex-"));
  const sid = "019f0000-0000-7000-8000-0000000000aa";
  const sessionDir = join(codexHome, "sessions/2026/07/08");
  mkdirSync(sessionDir, { recursive: true });
  const rollout =
    [
      JSON.stringify({ timestamp: "2026-07-08T10:00:00Z", type: "session_meta", payload: { session_id: sid, cwd: tmp } }),
      JSON.stringify({ timestamp: "2026-07-08T10:00:01Z", type: "event_msg", payload: { type: "user_message", message: "smoke codex hook" } }),
      JSON.stringify({ timestamp: "2026-07-08T10:00:02Z", type: "event_msg", payload: { type: "agent_message", message: "ok" } }),
    ].join("\n") + "\n";
  writeFileSync(join(sessionDir, `rollout-${sid}.jsonl`), rollout);

  try {
    // precompact 模式無節流，必歸檔；tmp 已被 stepInit 的 git init 變成 repo，故 codexRepoRoot()→tmp。
    const r = run(["hook", "codex", "precompact"], { cwd: tmp, env: { ...process.env, CODEX_HOME: codexHome }, stdin: "{}\n" });
    if (r.exitCode !== 0) return fail(step, `exit code ${r.exitCode}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);

    const convDir = join(tmp, "vault/palace/raw/conversations");
    const archived = findArchivedMd(convDir);
    if (!archived) return fail(step, `precompact 後 ${convDir} 下找不到歸檔檔（Codex hook 未寫出？）`);
    const text = readFileSync(archived, "utf8");
    if (!text.includes(`codex-session:${sid}`)) return fail(step, `歸檔檔 source 非 codex-session:${sid}：\n${text.slice(0, 400)}`);
    ok(step, `archived ${archived.slice(tmp.length + 1)}（source=codex-session:${sid}）`);
  } finally {
    rmSync(codexHome, { recursive: true, force: true });
  }
}

async function main(): Promise<number> {
  if (!existsSync(ELEGENT_BIN)) {
    fail("preflight", `${ELEGENT_BIN} 不存在——先跑 \`bun run build\``);
    return 1;
  }

  const tmp = mkdtempSync(join(tmpdir(), "elgt-smoke-"));
  try {
    stepInit(tmp);
    stepLint(tmp);
    stepVersion(tmp);
    await stepMcp(tmp);
    stepHookSessionStart(tmp);
    stepHookCodex(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\nSMOKE FAIL（${failures} 個步驟失敗）`);
    return 1;
  }
  console.log("\nSMOKE PASS");
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
