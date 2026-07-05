import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseNote } from "./frontmatter";

const RESERVED = new Set(["index.md", "log.md"]);

function describeDir(dir: string): string {
  // 目錄描述：取其 index.md 第一個條目前的既有描述不可靠，採固定空白（確定性優先）
  return "";
}

function indexDir(dir: string, isRoot: boolean, written: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.name !== ".obsidian" && !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));

  const subdirs = entries.filter((e) => e.isDirectory());
  const notes = entries.filter((e) => e.isFile() && e.name.endsWith(".md") && !RESERVED.has(e.name));

  for (const d of subdirs) indexDir(join(dir, d.name), false, written);

  const lines: string[] = [];
  if (subdirs.length) {
    lines.push("# Subdirectories", "");
    for (const d of subdirs) {
      const desc = describeDir(join(dir, d.name));
      lines.push(`* [${d.name}](${d.name}/index.md)${desc ? ` - ${desc}` : ""}`);
    }
    lines.push("");
  }
  if (notes.length) {
    lines.push("# Notes", "");
    for (const f of notes) {
      const { frontmatter } = parseNote(readFileSync(join(dir, f.name), "utf8"));
      const title = typeof frontmatter?.title === "string" ? frontmatter.title : basename(f.name, ".md");
      const desc = typeof frontmatter?.description === "string" ? frontmatter.description : "";
      lines.push(`* [${title}](${f.name})${desc ? ` - ${desc}` : ""}`);
    }
    lines.push("");
  }
  const body = lines.join("\n") || "# Empty\n";
  const content = isRoot ? `---\nokf_version: "0.1"\n---\n\n${body}` : body;
  const p = join(dir, "index.md");
  writeFileSync(p, content.endsWith("\n") ? content : content + "\n");
  written.push(p);
}

export function regenerateIndexes(vaultRoot: string): string[] {
  const written: string[] = [];
  indexDir(vaultRoot, true, written);
  return written;
}
