import { resolve, join, relative } from "node:path";
import { homedir } from "node:os";
import { runClaudeHookEntry } from "../hooks/claude/hook";
import { runCodexHookEntry } from "../hooks/codex/hook";
import { runAgyHookEntry } from "../hooks/agy/hook";
import { runReindexEntry } from "./reindex";
import { runLintEntry } from "./lint";
import { runGuardEntry } from "./guard";
import { runBackfillEntry } from "./backfill";
import { promptInitAnswers, type InitAnswers } from "./init-ui";
import { startServer } from "../mcp/server";
import { VERSION, isCompiledRuntime } from "@core/version";
import { bootstrap, type AgentConfigScope, type BootstrapOptions } from "@core/application/bootstrap";
import { slugify } from "@core/domain/safety";
import { nodeFileStore } from "@infrastructure/adapters/node-fs";
import { nodeGitRunner } from "@infrastructure/adapters/node-git";

const USAGE = `用法: elgt <command> [args]

指令:
  hook claude <stop|precompact|sessionend|sessionstart>  執行 Claude Code hook（讀 stdin JSON）
  hook codex <stop|precompact>                           執行 Codex CLI hook（讀 stdin JSON）
  hook agy <postinvocation|stop>                         執行 Antigravity CLI hook（讀 stdin JSON）
  init [dir] [--vault-name name] [--claude-scope project|user|none] [--codex-scope project|user|none] [--agy-scope project|user|none]
                                                  在（通常是空的）資料夾建立完整記憶系統
  reindex [vault]                                 重生 index.md
  lint [vault]                                    檢查 vault（違規時 exit 1）
  guard <file>                                    檢查檔案是否違反 palace/raw append-only 規則
  backfill [projectsDir]                          回填既有逐字稿（未歸檔的 session）
  mcp                                              啟動 elegent-memory MCP server（stdio）
  version                                          印出版本
`;

/**
 * 推導寫進模板（settings.json hooks/.mcp.json command）裡的執行檔路徑：
 * - 開發模式（`process.execPath` 是 bun 本身）→ `bun <elgt.ts 絕對路徑>`
 *   （settings.json 的 command 本來就是 shell 字串，兩段式一樣可執行）
 * - 編譯後（Task 26 產物，`isCompiledRuntime` 判定為 true）→ `process.execPath`
 *   就是那支單一執行檔本身
 *
 * compiled/dev 判斷委派給 src/core/version.ts 的 `isCompiledRuntime`（ELEGENT_COMPILED
 * define 優先、執行檔路徑後綴 fallback），與 autodigest.ts 的 `buildDigestCmd` 共用同一份
 * 邏輯，避免兩處各自維護一份不一致的後綴清單。
 */
function resolveElegentBin(): string {
  if (!isCompiledRuntime(process.execPath)) {
    return `bun ${resolve(import.meta.dir, "elgt.ts")}`;
  }
  return process.execPath;
}

/** 各子指令實際呼叫的函式，皆已抽出成獨立入口（與 `bun src/...` 直接呼叫路徑共用）。以物件注入方便測試 mock。 */
export interface ElegentDeps {
  hooks: Record<string, (argv?: string[]) => Promise<number>>;
  init: (dir: string, options?: BootstrapOptions) => Promise<number>;
  reindex: (argv?: string[]) => Promise<number>;
  lint: (argv?: string[]) => Promise<number>;
  guard: (argv?: string[]) => Promise<number>;
  backfill: (argv?: string[]) => Promise<number>;
  mcp: () => Promise<number>;
}

interface ParsedInitArgs {
  dir: string;
  options: BootstrapOptions;
  prompt: boolean;
}

function isAgentConfigScope(value: string): value is AgentConfigScope {
  return value === "project" || value === "user" || value === "none";
}

function normalizeVaultName(raw: string | undefined): string {
  return slugify(raw?.trim() || "vault") || "vault";
}

function parseInitArgs(argv: string[]): ParsedInitArgs | null {
  let dir: string | undefined;
  let vaultName: string | undefined;
  let claudeScope: AgentConfigScope | undefined;
  let codexScope: AgentConfigScope | undefined;
  let agyScope: AgentConfigScope | undefined;
  let nonInteractive = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--yes" || arg === "--non-interactive") {
      nonInteractive = true;
      continue;
    }
    if (arg === "--vault-name" || arg === "--name") {
      vaultName = argv[++i];
      if (!vaultName) return null;
      continue;
    }
    if (arg === "--claude-scope") {
      const value = argv[++i];
      if (!value || !isAgentConfigScope(value)) return null;
      claudeScope = value;
      continue;
    }
    if (arg === "--codex-scope") {
      const value = argv[++i];
      if (!value || !isAgentConfigScope(value)) return null;
      codexScope = value;
      continue;
    }
    if (arg === "--agy-scope") {
      const value = argv[++i];
      if (!value || !isAgentConfigScope(value)) return null;
      agyScope = value;
      continue;
    }
    if (arg.startsWith("--")) return null;
    if (dir) return null;
    dir = arg;
  }

  const prompt = !nonInteractive
    && Boolean(process.stdin.isTTY)
    && Boolean(process.stdout.isTTY)
    && (!vaultName || !claudeScope || !codexScope || !agyScope);

  return {
    dir: dir ?? process.cwd(),
    options: { vaultName, claudeScope, codexScope, agyScope },
    prompt,
  };
}

function defaultDeps(): ElegentDeps {
  return {
    hooks: {
      // 後端平權：`elgt hook <claude|codex|agy> <event>`，event 由各自入口讀 argv[0]。
      claude: runClaudeHookEntry,
      codex: runCodexHookEntry,
      agy: runAgyHookEntry,
      // Deprecated 相容別名：舊版 elgt init 產出的 settings.json 用裸事件名（`hook stop` 等，
      // 隱含 Claude）。保留以免打斷已安裝的使用者 vault；新產物一律用顯式 `hook claude <event>`。
      stop: (argv) => runClaudeHookEntry(["stop", ...(argv ?? [])]),
      precompact: (argv) => runClaudeHookEntry(["precompact", ...(argv ?? [])]),
      sessionend: (argv) => runClaudeHookEntry(["sessionend", ...(argv ?? [])]),
      sessionstart: (argv) => runClaudeHookEntry(["sessionstart", ...(argv ?? [])]),
    },
    init: async (dir: string, options: BootstrapOptions = {}) => {
      const elegentBin = resolveElegentBin();
      const result = bootstrap(nodeFileStore, nodeGitRunner, dir, elegentBin, {
        ...options,
        claudeUserDir: options.claudeUserDir ?? join(homedir(), ".claude"),
        codexUserDir: options.codexUserDir ?? join(homedir(), ".codex"),
        agyUserDir: options.agyUserDir ?? join(homedir(), ".gemini/config"),
      });
      const vaultName = normalizeVaultName(options.vaultName);
      console.log(`已在 ${dir} 建立/更新記憶系統（新增 ${result.created.length} 個檔案，略過 ${result.skipped.length} 個既有檔案）`);
      if (result.skipped.length > 0) {
        console.log("略過既有檔案：");
        for (const p of result.skipped) console.log(relative(dir, p));
      }
      for (const w of result.warnings) console.warn(`警告：${w}`);
      console.log(`
下一步：
1. 編輯 ${join(dir, vaultName, "palace/wake/identity.md")}——填入你是誰、關鍵的人、互動原則
2. 用 Obsidian 開啟 ${join(dir, vaultName)} 資料夾作為 vault
3. 重新啟動 Claude Code（或開新對話）以掛載 .mcp.json 裡的 elegent-memory MCP server
4. Codex CLI：若使用 project scope，請在此資料夾開 codex，用 /hooks 檢視並「信任」專案層 hooks（.codex/hooks.json），
   之後 Codex 的 Stop/PreCompact 才會自動歸檔對話（Codex 的 hook trust 機制）
5. Codex CLI 與 Antigravity 都讀 AGENTS.md（指向 CLAUDE.md 的 symlink）；要讓它們也能查記憶，
   把 elegent-memory 加進各自的 MCP 設定（Codex: ~/.codex/config.toml [mcp_servers]；
   Antigravity: ~/.gemini/config/mcp_config.json）——command 用「${elegentBin} mcp」
`);
      return 0;
    },
    reindex: runReindexEntry,
    lint: runLintEntry,
    guard: runGuardEntry,
    backfill: runBackfillEntry,
    mcp: async () => {
      try {
        await startServer();
        // startServer() 連上 stdio transport 後就 resolve（不代表 session 結束）；
        // MCP server 要常駐直到外部終止（父程序關閉 stdin 或送 SIGTERM），故這裡
        // 刻意回傳一個永不 resolve 的 promise，讓 elgt 的 process.exit 不會提早
        // 把剛啟動的 server 殺掉。失敗時（見下方 catch）才真的回 exit code。
        return await new Promise<number>(() => {});
      } catch (err) {
        console.error(err);
        return 1;
      }
    },
  };
}

/**
 * elgt CLI 的統一路由層：把子指令派發到既有 lib/hook/CLI 模組，不重寫任何邏輯。
 * 回傳 exit code；未知子指令或缺必要參數一律 2（usage 印到 stderr）。
 */
export async function main(argv: string[], deps: ElegentDeps = defaultDeps()): Promise<number> {
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case "hook": {
      const [sub, ...hookArgv] = rest;
      const fn = sub ? deps.hooks[sub] : undefined;
      if (!fn) {
        console.error(USAGE);
        return 2;
      }
      return fn(hookArgv);
    }
    case "init": {
      const parsed = parseInitArgs(rest);
      if (!parsed) {
        console.error(USAGE);
        return 2;
      }
      let options = parsed.options;
      if (parsed.prompt) {
        const defaults: InitAnswers = {
          vaultName: options.vaultName ?? "vault",
          claudeScope: options.claudeScope ?? "project",
          codexScope: options.codexScope ?? "project",
          agyScope: options.agyScope ?? "project",
        };
        const answers = await promptInitAnswers(defaults);
        options = { ...options, ...answers };
      }
      return deps.init(parsed.dir, options);
    }
    case "reindex":
      return deps.reindex(rest);
    case "lint":
      return deps.lint(rest);
    case "guard":
      return deps.guard(rest);
    case "backfill":
      return deps.backfill(rest);
    case "mcp":
      return deps.mcp();
    case "version":
      console.log(VERSION);
      return 0;
    default:
      console.error(USAGE);
      return 2;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
