import { resolve, join } from "node:path";
import { runStopEntry } from "../hooks/stop";
import { runPreCompactEntry } from "../hooks/precompact";
import { runSessionEndEntry } from "../hooks/sessionend";
import { runSessionStartEntry } from "../hooks/sessionstart";
import { runReindexEntry } from "./reindex";
import { runLintEntry } from "./lint";
import { runGuardEntry } from "./guard";
import { runBackfillEntry } from "./backfill";
import { startServer } from "../mcp/server";
import { VERSION } from "../lib/version";
import { bootstrap } from "../lib/bootstrap";

const USAGE = `用法: palace <command> [args]

指令:
  hook <stop|precompact|sessionend|sessionstart>  執行對應 hook（讀 stdin JSON）
  init [dir]                                      在（通常是空的）資料夾建立完整記憶系統
  reindex [vault]                                 重生 index.md
  lint [vault]                                    檢查 vault（違規時 exit 1）
  guard <file>                                    檢查檔案是否違反 palace/raw append-only 規則
  backfill [projectsDir]                          回填既有逐字稿（未歸檔的 session）
  mcp                                              啟動 palace-memory MCP server（stdio）
  version                                          印出版本
`;

/** 開發模式（直接用 bun 執行 palace.ts）的執行檔是否為 bun 本身，而非 Task 26 編譯出的單一執行檔。 */
function isDevRuntime(execPath: string): boolean {
  return execPath.endsWith("/bun") || execPath.endsWith("/bun.exe") || execPath.endsWith("\\bun.exe");
}

/**
 * 推導寫進模板（settings.json hooks/.mcp.json command）裡的執行檔路徑：
 * - 開發模式（`process.execPath` 是 bun 本身）→ `bun <palace.ts 絕對路徑>`
 *   （settings.json 的 command 本來就是 shell 字串，兩段式一樣可執行）
 * - 編譯後（Task 26 產物）→ `process.execPath` 就是那支單一執行檔本身
 */
function resolvePalaceBin(): string {
  if (isDevRuntime(process.execPath)) {
    return `bun ${resolve(import.meta.dir, "palace.ts")}`;
  }
  return process.execPath;
}

/** 各子指令實際呼叫的函式，皆已抽出成獨立入口（與 `bun tools/...` 直接呼叫路徑共用）。以物件注入方便測試 mock。 */
export interface PalaceDeps {
  hooks: Record<string, (argv?: string[]) => Promise<number>>;
  init: (dir: string) => Promise<number>;
  reindex: (argv?: string[]) => Promise<number>;
  lint: (argv?: string[]) => Promise<number>;
  guard: (argv?: string[]) => Promise<number>;
  backfill: (argv?: string[]) => Promise<number>;
  mcp: () => Promise<number>;
}

function defaultDeps(): PalaceDeps {
  return {
    hooks: {
      stop: runStopEntry,
      precompact: runPreCompactEntry,
      sessionend: runSessionEndEntry,
      sessionstart: runSessionStartEntry,
    },
    init: async (dir: string) => {
      const palaceBin = resolvePalaceBin();
      const result = bootstrap(dir, palaceBin);
      console.log(`已在 ${dir} 建立/更新記憶系統（新增 ${result.created.length} 個檔案，略過 ${result.skipped.length} 個既有檔案）`);
      for (const w of result.warnings) console.warn(`警告：${w}`);
      console.log(`
下一步：
1. 編輯 ${join(dir, "vault/palace/wake/identity.md")}——填入你是誰、關鍵的人、互動原則
2. 用 Obsidian 開啟 ${join(dir, "vault")} 資料夾作為 vault
3. 重新啟動 Claude Code（或開新對話）以掛載 .mcp.json 裡的 palace-memory MCP server
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
        // 刻意回傳一個永不 resolve 的 promise，讓 palace 的 process.exit 不會提早
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
 * palace CLI 的統一路由層：把子指令派發到既有 lib/hook/CLI 模組，不重寫任何邏輯。
 * 回傳 exit code；未知子指令或缺必要參數一律 2（usage 印到 stderr）。
 */
export async function main(argv: string[], deps: PalaceDeps = defaultDeps()): Promise<number> {
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
      const dir = rest[0] ?? process.cwd();
      return deps.init(dir);
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
