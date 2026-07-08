import { runStopEntry } from "./stop";
import { runPreCompactEntry } from "./precompact";
import { runSessionEndEntry } from "./sessionend";
import { runSessionStartEntry } from "./sessionstart";

const ENTRIES: Record<string, (argv?: string[]) => Promise<number>> = {
  stop: runStopEntry,
  precompact: runPreCompactEntry,
  sessionend: runSessionEndEntry,
  sessionstart: runSessionStartEntry,
};

/**
 * `elgt hook claude <event>` 的統一入口：argv[0] 選事件、其餘 argv 往下傳。與
 * `runCodexHookEntry`（argv[0] 選 stop|precompact）同形——讓 `hook claude <event>` 與
 * `hook codex <event>` 在 CLI route 天然平權，沒有哪個後端是「不必具名的預設」。
 * 未知事件回 2（usage 印到 stderr）。
 */
export async function runClaudeHookEntry(argv: string[] = []): Promise<number> {
  const event = argv[0];
  const fn = event ? ENTRIES[event] : undefined;
  if (!fn) {
    console.error("用法: elgt hook claude <stop|precompact|sessionend|sessionstart>");
    return 2;
  }
  return fn(argv.slice(1));
}
