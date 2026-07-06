import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchVault, readNote, listDir } from "./server";

const root = mkdtempSync(join(tmpdir(), "mcp-"));
mkdirSync(join(root, "projects"), { recursive: true });
writeFileSync(join(root, "projects/a.md"), "---\ntype: note\n---\n\n我喜歡 pnpm\n");
writeFileSync(join(root, "projects/b.md"), "---\ntype: note\n---\n\n另一篇沒有關鍵字\n");

test("searchVault 回 file:line", () => {
  const hits = searchVault(root, "pnpm", 10);
  expect(hits[0]).toContain("projects/a.md:");
  expect(hits[0]).toContain("pnpm");
});

test("searchVault 大小寫不敏感", () => {
  const hits = searchVault(root, "PNPM", 10);
  expect(hits.length).toBeGreaterThan(0);
  expect(hits[0]).toContain("pnpm");
});

test("searchVault 無命中回空陣列", () => {
  const hits = searchVault(root, "nonexistent-keyword-xyz", 10);
  expect(hits).toEqual([]);
});

test("searchVault 尊重 limit 上限", () => {
  const manyRoot = mkdtempSync(join(tmpdir(), "mcp-many-"));
  const lines = Array.from({ length: 30 }, (_, i) => `第 ${i} 行 target`).join("\n");
  writeFileSync(join(manyRoot, "many.md"), lines);
  const hits = searchVault(manyRoot, "target", 5);
  expect(hits.length).toBe(5);
});

test("searchVault 預設 limit 為 20", () => {
  const manyRoot = mkdtempSync(join(tmpdir(), "mcp-default-"));
  const lines = Array.from({ length: 30 }, (_, i) => `第 ${i} 行 target`).join("\n");
  writeFileSync(join(manyRoot, "many.md"), lines);
  const hits = searchVault(manyRoot, "target");
  expect(hits.length).toBe(20);
});

test("readNote 擋 vault 外路徑（相對）", () => {
  expect(() => readNote(root, "../etc/passwd")).toThrow();
  expect(readNote(root, "projects/a.md")).toContain("pnpm");
});

test("readNote 擋 vault 外路徑（絕對）", () => {
  expect(() => readNote(root, "/etc/passwd")).toThrow();
});

test("listDir 列子目錄與檔案", () => {
  const entries = listDir(root, "");
  expect(entries).toContain("projects/");
});

test("listDir 列出指定子目錄內容", () => {
  const entries = listDir(root, "projects");
  expect(entries).toContain("a.md");
  expect(entries).toContain("b.md");
});

test("listDir 擋 vault 外路徑", () => {
  expect(() => listDir(root, "..")).toThrow();
});
