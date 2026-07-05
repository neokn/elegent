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

if (import.meta.main) {
  const input = await readStdinJson();
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
