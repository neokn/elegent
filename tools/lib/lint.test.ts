import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintVault } from "./lint";

function vault(): string {
  const root = mkdtempSync(join(tmpdir(), "lint-"));
  mkdirSync(join(root, "palace/wake"), { recursive: true });
  mkdirSync(join(root, "palace/entities"), { recursive: true });
  return root;
}

test("缺 frontmatter 與非法 type 是硬錯誤", () => {
  const root = vault();
  writeFileSync(join(root, "bad1.md"), "# 沒有 frontmatter\n");
  writeFileSync(join(root, "bad2.md"), "---\ntype: banana\n---\n\nx\n");
  const r = lintVault(root);
  expect(r.errors.some((e) => e.rule === "frontmatter-parse" && e.file.endsWith("bad1.md"))).toBe(true);
  expect(r.errors.some((e) => e.rule === "type-vocab" && e.file.endsWith("bad2.md"))).toBe(true);
});

test("wikilink 是硬錯誤、缺 description 是軟提醒", () => {
  const root = vault();
  writeFileSync(join(root, "n.md"), "---\ntype: note\n---\n\n看 [[別頁]]\n");
  const r = lintVault(root);
  expect(r.errors.some((e) => e.rule === "wikilink-ban")).toBe(true);
  expect(r.warnings.some((w) => w.rule === "missing-description")).toBe(true);
});

test("倒置的事實區間是硬錯誤", () => {
  const root = vault();
  writeFileSync(
    join(root, "palace/entities/max.md"),
    "---\ntype: entity\ndescription: d\n---\n\n## Facts\n\n| predicate | object | valid_from | valid_to | confidence | source |\n|---|---|---|---|---|---|\n| lives_in | 台北 | 2026-01-01 | 2025-01-01 | 1.0 | x |\n",
  );
  const r = lintVault(root);
  expect(r.errors.some((e) => e.rule === "fact-interval")).toBe(true);
});

test("斷鏈是軟提醒不是錯誤", () => {
  const root = vault();
  writeFileSync(join(root, "n.md"), "---\ntype: note\ndescription: d\n---\n\n[尚未寫的頁](future.md)\n");
  const r = lintVault(root);
  expect(r.errors.length).toBe(0);
  expect(r.warnings.some((w) => w.rule === "broken-link")).toBe(true);
});
