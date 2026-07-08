import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, type ElegentDeps } from "./elgt";
import { VERSION } from "@core/version";

const CLI = new URL("./elgt.ts", import.meta.url).pathname;

function deps(overrides: Partial<ElegentDeps> = {}): ElegentDeps {
  return {
    hooks: {
      stop: async () => 0,
      precompact: async () => 0,
      sessionend: async () => 0,
      sessionstart: async () => 0,
    },
    init: async () => 0,
    reindex: async () => 0,
    lint: async () => 0,
    guard: async () => 0,
    backfill: async () => 0,
    mcp: async () => 0,
    ...overrides,
  };
}

// --- 路由派發（mock 注入） ---

test("hook stop 派發到 deps.hooks.stop 並傳遞剩餘 argv", async () => {
  let received: string[] | undefined;
  const code = await main(
    ["hook", "stop", "--foo"],
    deps({ hooks: { stop: async (argv) => { received = argv; return 0; }, precompact: async () => 0, sessionend: async () => 0, sessionstart: async () => 0 } }),
  );
  expect(code).toBe(0);
  expect(received).toEqual(["--foo"]);
});

test("hook precompact 派發到 deps.hooks.precompact", async () => {
  let called = false;
  const code = await main(
    ["hook", "precompact"],
    deps({ hooks: { stop: async () => 0, precompact: async () => { called = true; return 0; }, sessionend: async () => 0, sessionstart: async () => 0 } }),
  );
  expect(code).toBe(0);
  expect(called).toBe(true);
});

test("hook sessionend 派發到 deps.hooks.sessionend", async () => {
  let called = false;
  const code = await main(
    ["hook", "sessionend"],
    deps({ hooks: { stop: async () => 0, precompact: async () => 0, sessionend: async () => { called = true; return 0; }, sessionstart: async () => 0 } }),
  );
  expect(code).toBe(0);
  expect(called).toBe(true);
});

test("hook sessionstart 派發到 deps.hooks.sessionstart", async () => {
  let called = false;
  const code = await main(
    ["hook", "sessionstart"],
    deps({ hooks: { stop: async () => 0, precompact: async () => 0, sessionend: async () => 0, sessionstart: async () => { called = true; return 0; } } }),
  );
  expect(code).toBe(0);
  expect(called).toBe(true);
});

test("hook codex stop 派發到 deps.hooks.codex 並把 mode 當 argv 傳下去", async () => {
  let received: string[] | undefined;
  const code = await main(
    ["hook", "codex", "stop"],
    deps({ hooks: { stop: async () => 0, precompact: async () => 0, sessionend: async () => 0, sessionstart: async () => 0, codex: async (argv) => { received = argv; return 0; } } }),
  );
  expect(code).toBe(0);
  expect(received).toEqual(["stop"]);
});

test("hook claude precompact 派發到 deps.hooks.claude 並把 event 當 argv 傳下去（後端平權）", async () => {
  let received: string[] | undefined;
  const code = await main(
    ["hook", "claude", "precompact"],
    deps({ hooks: { claude: async (argv) => { received = argv; return 0; } } }),
  );
  expect(code).toBe(0);
  expect(received).toEqual(["precompact"]);
});

test("hook agy postinvocation 派發到 deps.hooks.agy 並把 event 當 argv 傳下去（後端平權）", async () => {
  let received: string[] | undefined;
  const code = await main(
    ["hook", "agy", "postinvocation"],
    deps({ hooks: { stop: async () => 0, precompact: async () => 0, sessionend: async () => 0, sessionstart: async () => 0, agy: async (argv) => { received = argv; return 0; } } }),
  );
  expect(code).toBe(0);
  expect(received).toEqual(["postinvocation"]);
});

test("init 派發到 deps.init 並傳遞指定的 dir", async () => {
  let received: string | undefined;
  const code = await main(["init", "/some/dir"], deps({ init: async (dir) => { received = dir; return 0; } }));
  expect(code).toBe(0);
  expect(received).toBe("/some/dir");
});

test("init flags：傳遞 vaultName 與 agent scopes", async () => {
  let received: unknown;
  const code = await main(
    ["init", "/some/dir", "--vault-name", "memory", "--claude-scope", "user", "--codex-scope", "none", "--agy-scope", "project"],
    deps({ init: async (_dir, options) => { received = options; return 0; } }),
  );
  expect(code).toBe(0);
  expect(received).toEqual({
    vaultName: "memory",
    claudeScope: "user",
    codexScope: "none",
    agyScope: "project",
  });
});

test("init flags：非法 scope exit 2", async () => {
  const code = await main(["init", "--claude-scope", "global"], deps());
  expect(code).toBe(2);
});

test("init flags：--claude-scope local 合法並傳遞給 deps.init", async () => {
  let received: unknown;
  const code = await main(
    ["init", "/some/dir", "--claude-scope", "local", "--codex-scope", "none", "--agy-scope", "none"],
    deps({ init: async (_dir, options) => { received = options; return 0; } }),
  );
  expect(code).toBe(0);
  expect(received).toMatchObject({ claudeScope: "local", codexScope: "none", agyScope: "none" });
});

test("init flags：local 混 user → exit 2（CLI 層擋下，不進 deps.init）", async () => {
  let called = false;
  const code = await main(
    ["init", "/some/dir", "--claude-scope", "local", "--codex-scope", "user", "--agy-scope", "none"],
    deps({ init: async () => { called = true; return 0; } }),
  );
  expect(code).toBe(2);
  expect(called).toBe(false);
});

test("init 未指定 dir 時預設 process.cwd()", async () => {
  let received: string | undefined;
  const code = await main(["init"], deps({ init: async (dir) => { received = dir; return 0; } }));
  expect(code).toBe(0);
  expect(received).toBe(process.cwd());
});

test("reindex 派發到 deps.reindex 並傳遞 argv", async () => {
  let received: string[] | undefined;
  const code = await main(["reindex", "/some/vault"], deps({ reindex: async (argv) => { received = argv; return 0; } }));
  expect(code).toBe(0);
  expect(received).toEqual(["/some/vault"]);
});

test("lint 派發到 deps.lint 並回傳其 exit code", async () => {
  const code = await main(["lint"], deps({ lint: async () => 1 }));
  expect(code).toBe(1);
});

test("guard 派發到 deps.guard 並傳遞檔名", async () => {
  let received: string[] | undefined;
  const code = await main(["guard", "note.md"], deps({ guard: async (argv) => { received = argv; return 0; } }));
  expect(code).toBe(0);
  expect(received).toEqual(["note.md"]);
});

test("backfill 派發到 deps.backfill", async () => {
  let called = false;
  const code = await main(["backfill", "/projects"], deps({ backfill: async () => { called = true; return 0; } }));
  expect(called).toBe(true);
  expect(code).toBe(0);
});

test("mcp 派發到 deps.mcp（不實際啟動 server）", async () => {
  let called = false;
  const code = await main(["mcp"], deps({ mcp: async () => { called = true; return 0; } }));
  expect(called).toBe(true);
  expect(code).toBe(0);
});

// --- 錯誤情境 ---

test("未知子指令 exit 2", async () => {
  const code = await main(["bogus"], deps());
  expect(code).toBe(2);
});

test("無子指令 exit 2", async () => {
  const code = await main([], deps());
  expect(code).toBe(2);
});

test("hook 缺子指令名稱 exit 2", async () => {
  const code = await main(["hook"], deps());
  expect(code).toBe(2);
});

test("hook 未知名稱 exit 2", async () => {
  const code = await main(["hook", "bogus"], deps());
  expect(code).toBe(2);
});

// --- 真實接線（spawn 二進位；不含 mcp，避免 stdio server 卡住測試） ---

test("真實 CLI: version 印出 src/core/version.ts 的常數", () => {
  const p = Bun.spawnSync(["bun", CLI, "version"]);
  expect(p.exitCode).toBe(0);
  expect(p.stdout.toString().trim()).toBe(VERSION);
});

test("真實 CLI: 未知指令 exit 2 且 usage 印到 stderr", () => {
  const p = Bun.spawnSync(["bun", CLI, "bogus"]);
  expect(p.exitCode).toBe(2);
  expect(p.stderr.toString().length).toBeGreaterThan(0);
});

test("真實 CLI: hook claude sessionstart 走真實入口（讀 stdin、輸出合法 JSON）", () => {
  const repo = mkdtempSync(join(tmpdir(), "elgt-cli-"));
  mkdirSync(join(repo, "vault/palace/wake"), { recursive: true });
  writeFileSync(join(repo, "vault/palace/wake/identity.md"), "---\ntype: wake\n---\n\n# Identity\n");
  const p = Bun.spawnSync(["bun", CLI, "hook", "claude", "sessionstart"], {
    cwd: repo,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
    stdin: new TextEncoder().encode("{}"),
  });
  expect(p.exitCode).toBe(0);
  expect(() => JSON.parse(p.stdout.toString().trim())).not.toThrow();
});

test("真實 CLI: hook agy postinvocation 走真實入口（讀 stdin、輸出合法 JSON）", () => {
  const repo = mkdtempSync(join(tmpdir(), "elgt-cli-agy-"));
  mkdirSync(join(repo, "vault/palace/wake"), { recursive: true });
  writeFileSync(join(repo, "vault/palace/wake/identity.md"), "---\ntype: wake\n---\n\n# Identity\n");
  const p = Bun.spawnSync(["bun", CLI, "hook", "agy", "postinvocation"], {
    cwd: repo,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
    stdin: new TextEncoder().encode("{}"),
  });
  expect(p.exitCode).toBe(0);
  expect(() => JSON.parse(p.stdout.toString().trim())).not.toThrow();
});

test("真實 CLI: 裸 hook sessionstart（deprecated 別名）仍相容（舊版 vault 的 settings.json）", () => {
  const repo = mkdtempSync(join(tmpdir(), "elgt-cli-alias-"));
  mkdirSync(join(repo, "vault/palace/wake"), { recursive: true });
  writeFileSync(join(repo, "vault/palace/wake/identity.md"), "---\ntype: wake\n---\n\n# Identity\n");
  const p = Bun.spawnSync(["bun", CLI, "hook", "sessionstart"], {
    cwd: repo,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
    stdin: new TextEncoder().encode("{}"),
  });
  expect(p.exitCode).toBe(0);
  expect(() => JSON.parse(p.stdout.toString().trim())).not.toThrow();
});

test("真實 CLI: lint 走真實入口（vault 骨架 0 errors）", () => {
  const repo = mkdtempSync(join(tmpdir(), "elgt-cli-lint-"));
  Bun.spawnSync(["bun", new URL("./scaffold.ts", import.meta.url).pathname, join(repo, "vault")]);
  const p = Bun.spawnSync(["bun", CLI, "lint", join(repo, "vault")], { cwd: repo });
  expect(p.exitCode).toBe(0);
  expect(p.stdout.toString()).toContain("0 errors");
});

test("真實 CLI: hook 缺子指令 exit 2", () => {
  const p = Bun.spawnSync(["bun", CLI, "hook"]);
  expect(p.exitCode).toBe(2);
});

test("真實 CLI: init 走真實入口——空 temp dir 建立完整記憶系統，stdout 含下一步指引", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-cli-init-"));
  const p = Bun.spawnSync(["bun", CLI, "init", dir, "--yes", "--claude-scope", "none", "--codex-scope", "none", "--agy-scope", "none"]);
  expect(p.exitCode).toBe(0);
  const out = p.stdout.toString();
  expect(out).toContain("identity.md");
  expect(out).toContain("Obsidian");
  expect(out).toContain("MCP");
  expect(existsSync(join(dir, "CLAUDE.md"))).toBe(false);
  expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
  expect(existsSync(join(dir, ".mcp.json"))).toBe(false);
  expect(existsSync(join(dir, ".git"))).toBe(true);
});

test("真實 CLI: init --vault-name 建立自訂 vault 目錄", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-cli-init-named-"));
  const p = Bun.spawnSync(["bun", CLI, "init", dir, "--vault-name", "my memory", "--claude-scope", "none", "--codex-scope", "none", "--agy-scope", "none"]);
  expect(p.exitCode).toBe(0);
  expect(existsSync(join(dir, "my-memory/palace/wake/identity.md"))).toBe(true);
  expect(existsSync(join(dir, "vault"))).toBe(false);
});

test("真實 CLI: init 第二次執行時逐檔列出略過的既有檔案（相對路徑）", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-cli-init-skip-"));
  const args = ["bun", CLI, "init", dir, "--yes", "--claude-scope", "none", "--codex-scope", "none", "--agy-scope", "none"];
  Bun.spawnSync(args); // 第一次：建立齊全
  const p = Bun.spawnSync(args); // 第二次：全部略過
  expect(p.exitCode).toBe(0);
  const out = p.stdout.toString();
  expect(out).toContain("略過既有檔案：");
  expect(out).toContain(".gitignore");
  expect(out).not.toContain(join(dir, ".gitignore")); // 逐行列出的是相對路徑，不是絕對路徑
});
