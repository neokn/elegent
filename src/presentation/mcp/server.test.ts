import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { slugify } from "@core/domain/safety";
import { searchVault, readNote, listDir, searchLimitSchema, SERVER_INFO, VAULT_INSTRUCTIONS, resolveVaultRoots, searchVaults } from "./server";
import { VERSION } from "@core/version";

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

// --- symlink 逃逸防護（realpath 驗證）---
// 注意：macOS 的 tmpdir 在 /var → /private/var symlink 之下，
// 測試 root 一律先 realpathSync 化，隔離「合法的 tmp symlink」與「攻擊 symlink」。

test("readNote 擋 vault 內 symlink 指向 vault 外檔案", () => {
  const symRoot = realpathSync(mkdtempSync(join(tmpdir(), "mcp-sym-")));
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "mcp-out-")));
  writeFileSync(join(outside, "secret.md"), "top secret");
  symlinkSync(join(outside, "secret.md"), join(symRoot, "evil-link.md"));
  expect(() => readNote(symRoot, "evil-link.md")).toThrow();
});

test("listDir 擋 symlink 目錄指向 vault 外", () => {
  const symRoot = realpathSync(mkdtempSync(join(tmpdir(), "mcp-symd-")));
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "mcp-outd-")));
  writeFileSync(join(outside, "x.md"), "outside");
  symlinkSync(outside, join(symRoot, "evil-dir"));
  expect(() => listDir(symRoot, "evil-dir")).toThrow();
});

test("vault 內 symlink 指向 vault 內檔案仍可讀", () => {
  const symRoot = realpathSync(mkdtempSync(join(tmpdir(), "mcp-symok-")));
  writeFileSync(join(symRoot, "real.md"), "in-vault content");
  symlinkSync(join(symRoot, "real.md"), join(symRoot, "alias.md"));
  expect(readNote(symRoot, "alias.md")).toContain("in-vault content");
});

// --- memory_search 的 limit schema（MCP 層 zod 驗證）---

test("searchLimitSchema：拒絕 0（下限 1）", () => {
  expect(searchLimitSchema.safeParse(0).success).toBe(false);
});

test("searchLimitSchema：拒絕負數與非整數", () => {
  expect(searchLimitSchema.safeParse(-1).success).toBe(false);
  expect(searchLimitSchema.safeParse(1.5).success).toBe(false);
});

test("searchLimitSchema：拒絕超過上限 200", () => {
  expect(searchLimitSchema.safeParse(201).success).toBe(false);
});

test("searchLimitSchema：接受 1、200 與 undefined（optional）", () => {
  expect(searchLimitSchema.safeParse(1).success).toBe(true);
  expect(searchLimitSchema.safeParse(200).success).toBe(true);
  expect(searchLimitSchema.safeParse(undefined).success).toBe(true);
});

// --- serverInfo 版本一致性 ---

test("SERVER_INFO.version 與 src/core/version.ts 的 VERSION 同步（單一版本真理來源）", () => {
  expect(SERVER_INFO.version).toBe(VERSION);
  expect(SERVER_INFO.name).toBe("elegent-memory");
});

test("readNote 擋同前綴 sibling 目錄的絕對路徑（vault-evil）", () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "mcp-sib-")));
  const sibRoot = join(base, "vault");
  const evil = join(base, "vault-evil");
  mkdirSync(sibRoot);
  mkdirSync(evil);
  writeFileSync(join(evil, "x.md"), "evil sibling");
  expect(() => readNote(sibRoot, join(evil, "x.md"))).toThrow();
  expect(() => listDir(sibRoot, evil)).toThrow();
});

test("VAULT_INSTRUCTIONS：非空、含檢索 SOP 與分層說明關鍵字", () => {
  expect(VAULT_INSTRUCTIONS.length).toBeGreaterThan(50);
  expect(VAULT_INSTRUCTIONS).toContain("memory_wake");
  expect(VAULT_INSTRUCTIONS).toContain("memory_search");
  expect(VAULT_INSTRUCTIONS).toContain("/digest");
  expect(VAULT_INSTRUCTIONS).toContain("[vault]");
});

test("resolveVaultRoots：主 vault + 自動探測 .{slug}.vault / {slug}.vault，realpath 去重", () => {
  const proj = mkdtempSync(join(tmpdir(), "app-"));
  const base = slugify(basename(proj));
  const global = mkdtempSync(join(tmpdir(), "global-vault-"));
  mkdirSync(join(proj, `.${base}.vault`));
  const roots = resolveVaultRoots({ ELEGENT_VAULT: global, CLAUDE_PROJECT_DIR: proj }, proj);
  expect(roots).toContain(global);
  expect(roots.some((r) => r.endsWith(`.${base}.vault`))).toBe(true);
});

test("searchVaults：結果帶 [標籤] 前綴", () => {
  const v1 = mkdtempSync(join(tmpdir(), "v1-"));
  writeFileSync(join(v1, "a.md"), "hello world\n");
  const hits = searchVaults([v1], "hello", 20);
  expect(hits[0]).toMatch(/^\[.+\] a\.md:1: hello world$/);
});
