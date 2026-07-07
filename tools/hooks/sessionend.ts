import { readStdinJson, emit, repoRoot, vaultRoot } from "../lib/hookio";
import { archiveTranscript } from "../lib/archive";
import { clearSession, logHookError } from "../lib/state";
import { sanitizeSessionId, validateTranscriptPath } from "../lib/safety";
import { maybeAutoDigest } from "../lib/autodigest";
import { regenerateIndexes } from "../lib/indexgen";

export interface SessionEndDeps {
  /** 回傳是否真的寫了檔（對齊 archiveTranscript 的 written——空 transcript 不算成功歸檔） */
  archive: (transcriptPath: string, sid: string) => boolean;
  clear: (sid: string) => void;
  log: (hook: string, err: unknown) => void;
  /** archive 真的寫檔後才呼叫（archive 拋錯、沒有 transcript、或 written:false 時不呼叫） */
  onArchived?: () => void;
  /**
   * archive 真的寫檔後同步重生 index.md（archive 拋錯、沒有 transcript、或
   * written:false 時不呼叫）。regenerateIndexes 是 Bun 內純函式（非 spawn，
   * 便宜），失敗以自己的 try/catch log 後吞掉——重生索引失敗不該擋歸檔/清游標。
   */
  reindex?: () => void;
}

export function runSessionEndHook(input: any, d: SessionEndDeps): Record<string, never> {
  const sid = sanitizeSessionId(String(input.session_id ?? ""));
  const tp = validateTranscriptPath(String(input.transcript_path ?? ""));
  if (!sid) return {};
  try {
    if (tp) {
      const written = d.archive(tp, sid);
      if (written) {
        d.onArchived?.();
        try {
          d.reindex?.();
        } catch (err) {
          try { d.log("sessionend:reindex", err); } catch {}
        }
      }
    }
  } catch (err) {
    try { d.log("sessionend", err); } catch {}
  } finally {
    try { d.clear(sid); } catch {}
  }
  return {};
}

/**
 * `bun tools/hooks/sessionend.ts` 與 `elgt hook sessionend` 共用的入口邏輯；恆回 0。
 * argv 目前未使用（sessionend hook 只讀 stdin），保留參數與其他入口函式簽章一致。
 */
export async function runSessionEndEntry(argv?: string[]): Promise<number> {
  try {
    const input = await readStdinJson();
    // headless digest 子程序（spawnAutoDigest 帶 ELEGENT_HEADLESS_DIGEST=1 啟動）的
    // transcript 是館員自己的工作逐字稿，不是使用者記憶素材：直接放行，不歸檔、
    // 不觸發下一輪自動蒸餾，否則 backlog 會把自己蒸餾自己的紀錄，永不收斂。
    if (process.env.ELEGENT_HEADLESS_DIGEST === "1") {
      emit({});
    } else {
      let archivedOk = false;
      emit(
        runSessionEndHook(input, {
          archive: (tp, sid) => archiveTranscript(tp, vaultRoot(), sid).written,
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
          enabled: process.env.ELEGENT_AUTO_DIGEST === "1",
          archivedOk,
          repoRoot: repoRoot(),
        });
      } catch (err) {
        try { logHookError(repoRoot(), "sessionend:autodigest", err); } catch {}
      }
    }
  } catch (err) {
    try { logHookError(repoRoot(), "sessionend", err); } catch {}
    try { emit({}); } catch {}
  }
  return 0;
}

if (import.meta.main) {
  process.exit(await runSessionEndEntry(process.argv.slice(2)));
}
