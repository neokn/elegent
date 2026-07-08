import { join, basename } from "node:path";
import { parseNote } from "./frontmatter";
import type { FileStore } from "./ports";

const RESERVED = new Set(["index.md", "log.md"]);

function indexDir(store: FileStore, dir: string, isRoot: boolean, written: string[]): void {
  const entries = store
    .entries(dir)
    .filter((e) => e.name !== ".obsidian" && !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));

  const subdirs = entries.filter((e) => e.isDir);
  const notes = entries.filter((e) => e.isFile && e.name.endsWith(".md") && !RESERVED.has(e.name));

  for (const d of subdirs) indexDir(store, join(dir, d.name), false, written);

  const lines: string[] = [];
  if (subdirs.length) {
    lines.push("# Subdirectories", "");
    for (const d of subdirs) lines.push(`* [${d.name}](${d.name}/index.md)`);
    lines.push("");
  }
  if (notes.length) {
    lines.push("# Notes", "");
    for (const f of notes) {
      const { frontmatter } = parseNote(store.read(join(dir, f.name)));
      const title = typeof frontmatter?.title === "string" ? frontmatter.title : basename(f.name, ".md");
      const desc = typeof frontmatter?.description === "string" ? frontmatter.description : "";
      lines.push(`* [${title}](${f.name})${desc ? ` - ${desc}` : ""}`);
    }
    lines.push("");
  }
  const body = lines.join("\n") || "# Empty\n";
  const content = isRoot ? `---\nokf_version: "0.1"\n---\n\n${body}` : body;
  const p = join(dir, "index.md");
  store.write(p, content.endsWith("\n") ? content : content + "\n");
  written.push(p);
}

export function regenerateIndexes(store: FileStore, vaultRoot: string): string[] {
  const written: string[] = [];
  indexDir(store, vaultRoot, true, written);
  return written;
}
