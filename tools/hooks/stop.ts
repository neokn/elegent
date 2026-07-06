import { readFileSync } from "node:fs";
import { readStdinJson, emit, repoRoot, vaultRoot } from "../lib/hookio";
import { archiveTranscript } from "../lib/archive";
import { SAVE_INTERVAL, countUserMessages, readLastSave, writeLastSave, logHookError } from "../lib/state";
import { sanitizeSessionId, validateTranscriptPath } from "../lib/safety";

export interface StopDeps {
  countUser: (jsonl: string) => number;
  readLast: (root: string, sid: string) => number;
  writeLast: (root: string, sid: string, n: number) => void;
  archive: (transcriptPath: string, sid: string) => void;
  readTranscript: (p: string) => string;
  log: (hook: string, err: unknown) => void;
}

export function runStopHook(input: any, d: StopDeps): Record<string, never> {
  try {
    if (input.stop_hook_active === true) return {};
    const sid = sanitizeSessionId(String(input.session_id ?? ""));
    const tp = validateTranscriptPath(String(input.transcript_path ?? ""));
    if (!sid || !tp) return {};
    const count = d.countUser(d.readTranscript(tp));
    if (count - d.readLast(repoRoot(), sid) < SAVE_INTERVAL) return {};
    d.archive(tp, sid);
    d.writeLast(repoRoot(), sid, count);
  } catch (err) {
    try { d.log("stop", err); } catch {}
  }
  return {};
}

/**
 * `bun tools/hooks/stop.ts` 與 `palace hook stop` 共用的入口邏輯；恆回 0（hooks 絕不擋對話）。
 * argv 目前未使用（stop hook 只讀 stdin），保留參數是為了與其他入口函式簽章一致，方便 palace 統一路由。
 */
export async function runStopEntry(argv?: string[]): Promise<number> {
  try {
    const input = await readStdinJson();
    // headless digest 子程序（見 tools/lib/autodigest.ts）的 transcript 是館員自己
    // 的工作逐字稿，不是使用者記憶素材：直接放行，不歸檔。
    if (process.env.PALACE_HEADLESS_DIGEST === "1") {
      emit({});
    } else {
      emit(
        runStopHook(input, {
          countUser: countUserMessages,
          readLast: readLastSave,
          writeLast: writeLastSave,
          archive: (tp, sid) => archiveTranscript(tp, vaultRoot(), sid),
          readTranscript: (p) => readFileSync(p, "utf8"),
          log: (h, e) => logHookError(repoRoot(), h, e),
        }),
      );
    }
  } catch (err) {
    try { logHookError(repoRoot(), "stop", err); } catch {}
    try { emit({}); } catch {}
  }
  return 0;
}

if (import.meta.main) {
  process.exit(await runStopEntry(process.argv.slice(2)));
}
