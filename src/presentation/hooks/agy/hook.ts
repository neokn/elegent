import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { readStdinJson, emit, repoRoot, vaultRoot } from "@presentation/hooks/hookio";
import { nodeFileStore } from "@infrastructure/adapters/node-fs";
import { readLastSave, writeLastSave, logHookError } from "@infrastructure/state";
import { regenerateIndexes } from "@core/application/indexgen";
import {
  archiveAgyTranscript,
  countAgyUserMessages,
} from "@core/application/transcript/agy";
import { sanitizeSessionId, validateTranscriptPath, slugify } from "@core/domain/safety";

/**
 * "stop" 目前只當成 log 標籤（`agy:${mode}:reindex`）用，行為與 "postinvocation" 完全
 * 相同（皆用訊息數節流）——不像 Codex 的 `mode === "stop"` 那樣有實際分支。這是刻意
 * 保留的 CLI 介面（`elgt hook agy stop`），供 Antigravity 之後若補上獨立於 PostInvocation
 * 的 session-end 事件時對接；`mergeAgyHooks`／dogfood 的 `.agents/hooks.json` 目前都
 * 只掛 PostInvocation，沒有任何設定會真的呼叫到 "stop"，故此路徑目前無法從真實 hook
 * 觸發，只能手動呼叫。
 */
export type AgyHookMode = "postinvocation" | "stop";

export function runAgyArchiveHook(input: any, mode: AgyHookMode): Record<string, any> {
  const sid = sanitizeSessionId(String(input.conversationId ?? ""));
  const tp = validateTranscriptPath(String(input.transcriptPath ?? ""));
  if (!sid || !tp) return {};
  
  const text = readFileSync(tp, "utf8");
  const count = countAgyUserMessages(text);
  
  const lastCount = readLastSave(repoRoot(), sid);
  if (count <= lastCount) return {};

  let projectSlug: string | null = null;
  if (Array.isArray(input.workspacePaths) && input.workspacePaths.length > 0) {
    const p = input.workspacePaths[0];
    if (typeof p === "string" && p.length > 0) {
      projectSlug = slugify(basename(p)) || null;
    }
  }

  const res = archiveAgyTranscript(nodeFileStore, tp, vaultRoot(), sid, undefined, projectSlug);
  writeLastSave(repoRoot(), sid, count);

  if (res.written) {
    try {
      regenerateIndexes(nodeFileStore, vaultRoot());
    } catch (err) {
      logHookError(repoRoot(), `agy:${mode}:reindex`, err);
    }
  }
  return {};
}

export async function runAgyHookEntry(argv: string[] = []): Promise<number> {
  const mode: AgyHookMode = argv[0] === "stop" ? "stop" : "postinvocation";
  try {
    const input = await readStdinJson();
    if (process.env.ELEGENT_HEADLESS_DISTIL === "1") {
      emit({});
      return 0;
    }
    const res = runAgyArchiveHook(input, mode);
    emit(res);
  } catch (err) {
    try { logHookError(repoRoot(), `agy:${mode}`, err); } catch {}
    try { emit({}); } catch {}
  }
  return 0;
}

if (import.meta.main) {
  process.exit(await runAgyHookEntry(process.argv.slice(2)));
}
