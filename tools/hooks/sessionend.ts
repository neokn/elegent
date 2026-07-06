import { readStdinJson, emit, repoRoot, vaultRoot } from "../lib/hookio";
import { archiveTranscript } from "../lib/archive";
import { clearSession, logHookError } from "../lib/state";
import { sanitizeSessionId, validateTranscriptPath } from "../lib/safety";
import { shouldSpawnDigest, spawnAutoDigest } from "../lib/autodigest";

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
    // 歸檔完成後，若使用者顯式開啟自動蒸餾（預設關閉——headless 蒸餾耗 token），
    // 且目前沒有存活的蒸餾子程序在跑，就在背景 spawn 一個 headless /digest。
    if (process.env.PALACE_AUTO_DIGEST === "1" && shouldSpawnDigest(repoRoot())) {
      spawnAutoDigest(repoRoot());
    }
  } catch (err) {
    try { logHookError(repoRoot(), "sessionend", err); } catch {}
    try { emit({}); } catch {}
  }
}
