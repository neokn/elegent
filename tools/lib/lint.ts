import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { parseNote, validateFrontmatter } from "./frontmatter";
import { buildWakeBundle, WAKE_MAX_CHARS } from "./wake";

export interface LintIssue { file: string; rule: string; message: string }

const RESERVED = new Set(["index.md", "log.md"]);

function mdFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...mdFiles(p));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function checkFactTable(file: string, body: string, errors: LintIssue[]): void {
  const section = body.split(/^## Facts$/m)[1];
  if (!section) return;
  for (const line of section.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 7 || cells[1] === "predicate" || cells[1].startsWith("---")) continue;
    const [, , , from, to] = cells;
    if (from && to && /^\d{4}-\d{2}-\d{2}/.test(from) && /^\d{4}-\d{2}-\d{2}/.test(to) && to < from) {
      errors.push({ file, rule: "fact-interval", message: `倒置區間：valid_to ${to} < valid_from ${from}` });
    }
  }
}

export function lintVault(vaultRoot: string): { errors: LintIssue[]; warnings: LintIssue[] } {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];

  for (const file of mdFiles(vaultRoot)) {
    const name = file.split("/").at(-1)!;
    const text = readFileSync(file, "utf8");
    const { frontmatter, body } = parseNote(text);

    if (!RESERVED.has(name)) {
      if (!frontmatter) errors.push({ file, rule: "frontmatter-parse", message: "frontmatter 缺失或不可解析" });
      else {
        for (const msg of validateFrontmatter(frontmatter)) {
          errors.push({ file, rule: msg.includes("type") ? "type-vocab" : "frontmatter-parse", message: msg });
        }
        if (typeof frontmatter.description !== "string" || !frontmatter.description) {
          warnings.push({ file, rule: "missing-description", message: "缺 description" });
        }
      }
    }

    if (/\[\[/.test(body)) errors.push({ file, rule: "wikilink-ban", message: "body 出現 wikilink" });
    checkFactTable(file, body, errors);

    for (const m of body.matchAll(/\]\(([^)\s#]+\.md)(#[^)]*)?\)/g)) {
      const target = resolve(dirname(file), m[1]);
      if (!existsSync(target)) warnings.push({ file, rule: "broken-link", message: `斷鏈：${m[1]}` });
    }
  }

  const wake = buildWakeBundle(vaultRoot);
  if (!wake.withinBudget) {
    errors.push({ file: join(vaultRoot, "palace/wake"), rule: "wake-budget", message: `wake ${wake.chars} 字元 > ${WAKE_MAX_CHARS}` });
  }
  return { errors, warnings };
}
