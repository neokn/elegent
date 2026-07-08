import { join } from "node:path";
import { parseNote } from "@core/domain/frontmatter";
import type { FileStore } from "@core/ports";

export const WAKE_MAX_CHARS = 3600;

function bodyOf(store: FileStore, path: string): string {
  const raw = store.tryRead(path);
  return raw === null ? "" : parseNote(raw).body.trim();
}

export function buildWakeBundle(
  store: FileStore,
  vaultRoot: string,
): { text: string; chars: number; withinBudget: boolean } {
  const parts = [
    bodyOf(store, join(vaultRoot, "palace/wake/identity.md")),
    bodyOf(store, join(vaultRoot, "palace/wake/essential-story.md")),
  ].filter((p) => p.length > 0);
  const text = parts.join("\n\n---\n\n");
  return { text, chars: text.length, withinBudget: text.length <= WAKE_MAX_CHARS };
}
