import { readStdinJson, emit, repoRoot, vaultRoot } from "../lib/hookio";
import { archiveTranscript } from "../lib/archive";
import { clearSession, logHookError } from "../lib/state";
import { sanitizeSessionId, validateTranscriptPath } from "../lib/safety";

export interface SessionEndDeps {
  archive: (transcriptPath: string, sid: string) => void;
  clear: (sid: string) => void;
  log: (hook: string, err: unknown) => void;
}

export function runSessionEndHook(input: any, d: SessionEndDeps): Record<string, never> {
  const sid = sanitizeSessionId(String(input.session_id ?? ""));
  const tp = validateTranscriptPath(String(input.transcript_path ?? ""));
  if (!sid) return {};
  try {
    if (tp) d.archive(tp, sid);
  } catch (err) {
    try { d.log("sessionend", err); } catch {}
  } finally {
    try { d.clear(sid); } catch {}
  }
  return {};
}

if (import.meta.main) {
  try {
    const input = await readStdinJson();
    emit(
      runSessionEndHook(input, {
        archive: (tp, sid) => archiveTranscript(tp, vaultRoot(), sid),
        clear: (sid) => clearSession(repoRoot(), sid),
        log: (h, e) => logHookError(repoRoot(), h, e),
      }),
    );
  } catch (err) {
    try { logHookError(repoRoot(), "sessionend", err); } catch {}
    try { emit({}); } catch {}
  }
}
