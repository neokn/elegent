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
    if (process.env.ELEGENT_HEADLESS_DIGEST === "1") {
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
