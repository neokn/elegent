import { readStdinJson, emit, repoRoot, vaultRoot } from "../lib/hookio";
import { archiveTranscript } from "../lib/archive";
import { clearSession, logHookError } from "../lib/state";
import { sanitizeSessionId, validateTranscriptPath } from "../lib/safety";
import { maybeAutoDigest } from "../lib/autodigest";
import { regenerateIndexes } from "../lib/indexgen";

export interface SessionEndDeps {
  archive: (transcriptPath: string, sid: string) => void;
  clear: (sid: string) => void;
  log: (hook: string, err: unknown) => void;
  /** archive 成功後呼叫（archive 拋錯或沒有 transcript 時不呼叫） */
  onArchived?: () => void;
  /**
   * archive 成功後同步重生 index.md（archive 拋錯或沒有 transcript 時不呼叫）。
   * regenerateIndexes 是 Bun 內純函式（非 spawn，便宜），失敗以自己的 try/catch
   * log 後吞掉——重生索引失敗不該擋歸檔/清游標。
   */
  reindex?: () => void;
}

export function runSessionEndHook(input: any, d: SessionEndDeps): Record<string, never> {
  const sid = sanitizeSessionId(String(input.session_id ?? ""));
  const tp = validateTranscriptPath(String(input.transcript_path ?? ""));
  if (!sid) return {};
  try {
    if (tp) {
      d.archive(tp, sid);
      d.onArchived?.();
      try {
        d.reindex?.();
      } catch (err) {
        try { d.log("sessionend:reindex", err); } catch {}
      }
    }
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
    let archivedOk = false;
    emit(
      runSessionEndHook(input, {
        archive: (tp, sid) => archiveTranscript(tp, vaultRoot(), sid),
        clear: (sid) => clearSession(repoRoot(), sid),
        log: (h, e) => logHookError(repoRoot(), h, e),
        onArchived: () => { archivedOk = true; },
        reindex: () => regenerateIndexes(vaultRoot()),
      }),
    );
    // 歸檔成功後，若使用者顯式開啟自動蒸餾（預設關閉——headless 蒸餾耗 token），
    // 在背景 spawn 一個 headless /digest。包在自己的 try/catch：此時 emit 已
    // 執行過，例外若逸出到外層 catch 會 emit 第二次（double emit）——這裡
    // log 後吞掉即可，hook 永不阻塞。
    try {
      maybeAutoDigest({
        enabled: process.env.PALACE_AUTO_DIGEST === "1",
        archivedOk,
        repoRoot: repoRoot(),
      });
    } catch (err) {
      try { logHookError(repoRoot(), "sessionend:autodigest", err); } catch {}
    }
  } catch (err) {
    try { logHookError(repoRoot(), "sessionend", err); } catch {}
    try { emit({}); } catch {}
  }
}
