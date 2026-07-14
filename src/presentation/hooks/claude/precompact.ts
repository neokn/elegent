import { readFileSync } from "node:fs";
import { readStdinJson, emit, repoRoot, vaultRoot } from "@presentation/hooks/hookio";
import { archiveClaudeTranscript, countClaudeUserMessages } from "@core/application/transcript/claude";
import { nodeFileStore } from "@infrastructure/adapters/node-fs";
import { readLastSave, writeLastSave, logHookError } from "@infrastructure/state";
import { sanitizeSessionId, validateTranscriptPath } from "@core/domain/safety";
import type { StopDeps } from "./stop";

export function runPreCompactHook(input: any, d: StopDeps): Record<string, never> {
  try {
    const sid = sanitizeSessionId(String(input.session_id ?? ""));
    const tp = validateTranscriptPath(String(input.transcript_path ?? ""));
    if (!sid || !tp) return {};
    d.archive(tp, sid);
    d.writeLast(repoRoot(), sid, d.countUser(d.readTranscript(tp)));
  } catch (err) {
    try { d.log("precompact", err); } catch {}
  }
  return {};
}

/**
 * `bun src/hooks/precompact.ts` 與 `elgt hook precompact` 共用的入口邏輯；恆回 0。
 * argv 目前未使用（precompact hook 只讀 stdin），保留參數與其他入口函式簽章一致。
 */
export async function runPreCompactEntry(argv?: string[]): Promise<number> {
  try {
    const input = await readStdinJson();
    // headless distil 子程序（見 src/infrastructure/autodistil.ts）的 transcript 是館員自己
    // 的工作逐字稿，不是使用者記憶素材：直接放行，不歸檔。
    if (process.env.ELEGENT_HEADLESS_DISTIL === "1") {
      emit({});
    } else {
      emit(
        runPreCompactHook(input, {
          countUser: countClaudeUserMessages,
          readLast: readLastSave,
          writeLast: writeLastSave,
          archive: (tp, sid) => archiveClaudeTranscript(nodeFileStore, tp, vaultRoot(), sid),
          readTranscript: (p) => readFileSync(p, "utf8"),
          log: (h, e) => logHookError(repoRoot(), h, e),
        }),
      );
    }
  } catch (err) {
    try { logHookError(repoRoot(), "precompact", err); } catch {}
    try { emit({}); } catch {}
  }
  return 0;
}

if (import.meta.main) {
  process.exit(await runPreCompactEntry(process.argv.slice(2)));
}
