import { join, dirname, resolve, relative } from "node:path";
import { parseNote, validateFrontmatter } from "@core/domain/frontmatter";
import { buildWakeBundle, WAKE_MAX_CHARS } from "@core/application/wake";
import type { FileStore, GitRunner } from "@core/ports";

export interface LintIssue { file: string; rule: string; message: string }

const RESERVED = new Set(["index.md", "log.md"]);

/** vault 內所有 .md（跳過任何以 "." 開頭的路徑段，如 .obsidian）。 */
function mdFiles(store: FileStore, dir: string): string[] {
  return store.walkFiles(dir, ".md").filter((f) => !relative(dir, f).split("/").some((seg) => seg.startsWith(".")));
}

/** 把 fenced code block 與 inline code span 換成等長空白，讓 code 內容不觸發連結類規則。 */
function stripCode(body: string): string {
  return body
    .replace(/```[\s\S]*?(```|$)/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
}

function checkFactTable(file: string, body: string, errors: LintIssue[]): void {
  const section = body.split(/^## Facts$/m)[1];
  if (!section) return;
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed.split("|").map((c) => c.trim());
    if (cells.length < 7 || cells[1] === "predicate" || cells[1].startsWith("---")) continue;
    const [, , , from, to] = cells;
    if (from && to && /^\d{4}-\d{2}-\d{2}/.test(from) && /^\d{4}-\d{2}-\d{2}/.test(to) && to < from) {
      errors.push({ file, rule: "fact-interval", message: `倒置區間：valid_to ${to} < valid_from ${from}` });
    }
  }
}

/**
 * 檢查 palace/raw（append-only 層）自 HEAD 以來的變更。
 * 保留檔（index.md、log.md，reindex 會重生）的變更完全忽略；
 * 其餘檔案：刪除（D）是硬錯誤，修改（M，通常來自 hooks 對成長中 session 的冪等覆寫）降為警告。
 * git 指令本身失敗（例如不在 git repo 內）時回傳警告，不靜默略過。
 */
export function checkRawImmutable(git: GitRunner, vaultRoot: string, cwd: string): { errors: LintIssue[]; warnings: LintIssue[] } {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];
  const rawPath = relative(cwd, join(vaultRoot, "palace/raw"));
  const diff = git.diffNameStatus(cwd, rawPath);

  if (!diff.ok) {
    warnings.push({
      file: rawPath,
      rule: "raw-immutable-check-failed",
      message: `git diff 執行失敗，無法檢查 palace/raw 是否被修改（${diff.detail}）`,
    });
    return { errors, warnings };
  }

  for (const line of diff.lines.split("\n")) {
    if (!line.trim()) continue;
    const [status, file] = line.split("\t");
    if (!file) continue;
    if (RESERVED.has(file.split("/").at(-1) ?? "")) continue; // reindex 重生的保留檔，變更完全忽略
    if (status === "D") {
      errors.push({ file, rule: "raw-immutable", message: "palace/raw 為 append-only，不可刪除既有檔" });
    } else if (status === "M") {
      warnings.push({ file, rule: "raw-immutable", message: "raw 檔被修改——若非 hooks 冪等覆寫請檢查" });
    }
  }
  return { errors, warnings };
}

/** file 是否在 dir 之內（含子目錄）。 */
function isUnderDir(file: string, dir: string): boolean {
  const rel = relative(dir, file);
  return rel !== "" && !rel.startsWith("..");
}

export function lintVault(store: FileStore, vaultRoot: string): { errors: LintIssue[]; warnings: LintIssue[] } {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];
  const rawRoot = join(vaultRoot, "palace/raw");

  for (const file of mdFiles(store, vaultRoot)) {
    const name = file.split("/").at(-1)!;
    const text = store.read(file);
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

    // palace/raw 是逐字保存的 append-only 層：內容規則（wikilink-ban/fact-interval/broken-link）
    // 針對的是可修的蒸餾產出，對逐字對話檔只會產生「不可修復」的硬錯誤，故只做 frontmatter 檢查。
    if (isUnderDir(file, rawRoot)) continue;

    const prose = stripCode(body);
    if (/\[\[/.test(prose)) errors.push({ file, rule: "wikilink-ban", message: "body 出現 wikilink" });
    checkFactTable(file, body, errors);

    for (const m of prose.matchAll(/\]\(([^)\s#]+\.md)(#[^)]*)?\)/g)) {
      const target = resolve(dirname(file), m[1]);
      if (!store.exists(target)) warnings.push({ file, rule: "broken-link", message: `斷鏈：${m[1]}` });
    }
  }

  const wake = buildWakeBundle(store, vaultRoot);
  if (!wake.withinBudget) {
    errors.push({ file: join(vaultRoot, "palace/wake"), rule: "wake-budget", message: `wake ${wake.chars} 字元 > ${WAKE_MAX_CHARS}` });
  }
  return { errors, warnings };
}
