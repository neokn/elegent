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

const USAGE = `用法: palace <command> [args]

指令:
  hook <stop|precompact|sessionend|sessionstart>  執行對應 hook（讀 stdin JSON）
  reindex [vault]                                 重生 index.md
  lint [vault]                                    檢查 vault（違規時 exit 1）
  guard <file>                                    檢查檔案是否違反 palace/raw append-only 規則
  backfill [projectsDir]                          回填既有逐字稿（未歸檔的 session）
  mcp                                              啟動 palace-memory MCP server（stdio）
  version                                          印出版本
`;

/** 各子指令實際呼叫的函式，皆已抽出成獨立入口（與 `bun tools/...` 直接呼叫路徑共用）。以物件注入方便測試 mock。 */
export interface PalaceDeps {
  hooks: Record<string, (argv?: string[]) => Promise<number>>;
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
