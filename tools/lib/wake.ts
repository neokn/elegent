import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseNote } from "./frontmatter";

export const WAKE_MAX_CHARS = 3600;

function bodyOf(path: string): string {
  if (!existsSync(path)) return "";
  return parseNote(readFileSync(path, "utf8")).body.trim();
}

export function buildWakeBundle(vaultRoot: string): { text: string; chars: number; withinBudget: boolean } {
  const parts = [
    bodyOf(join(vaultRoot, "palace/wake/identity.md")),
    bodyOf(join(vaultRoot, "palace/wake/essential-story.md")),
  ].filter((p) => p.length > 0);
  const text = parts.join("\n\n---\n\n");
  return { text, chars: text.length, withinBudget: text.length <= WAKE_MAX_CHARS };
}
