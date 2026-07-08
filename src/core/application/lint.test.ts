import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintVault, checkRawImmutable } from "@core/application/lint";
import { nodeFileStore } from "@infrastructure/adapters/node-fs";
import { nodeGitRunner } from "@infrastructure/adapters/node-git";

function vault(): string {
  const root = mkdtempSync(join(tmpdir(), "lint-"));
  mkdirSync(join(root, "palace/wake"), { recursive: true });
  mkdirSync(join(root, "palace/entities"), { recursive: true });
  return root;
}

function git(args: string[], cwd: string) {
  return Bun.spawnSync(["git", ...args], { cwd });
}

/** 建一個含 vault/palace/raw 結構、已 commit 一份 index.md 與一份對話檔的 repo。 */
function setupRawRepo(): string {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "raw-repo-")));
  git(["init", "-q"], repo);
  mkdirSync(join(repo, "vault/palace/raw/conversations"), { recursive: true });
  writeFileSync(join(repo, "vault/palace/raw/index.md"), "# raw index\n");
  writeFileSync(
    join(repo, "vault/palace/raw/conversations/sess-1.md"),
    "---\ntype: raw-log\ndescription: d\n---\n\n逐字內容\n",
  );
  git(["add", "."], repo);
  git(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init"], repo);
  return repo;
}

test("缺 frontmatter 與非法 type 是硬錯誤", () => {
  const root = vault();
  writeFileSync(join(root, "bad1.md"), "# 沒有 frontmatter\n");
  writeFileSync(join(root, "bad2.md"), "---\ntype: banana\n---\n\nx\n");
  const r = lintVault(nodeFileStore, root);
  expect(r.errors.some((e) => e.rule === "frontmatter-parse" && e.file.endsWith("bad1.md"))).toBe(true);
  expect(r.errors.some((e) => e.rule === "type-vocab" && e.file.endsWith("bad2.md"))).toBe(true);
});

test("wikilink 是硬錯誤、缺 description 是軟提醒", () => {
  const root = vault();
  writeFileSync(join(root, "n.md"), "---\ntype: note\n---\n\n看 [[別頁]]\n");
  const r = lintVault(nodeFileStore, root);
  expect(r.errors.some((e) => e.rule === "wikilink-ban")).toBe(true);
  expect(r.warnings.some((w) => w.rule === "missing-description")).toBe(true);
});

test("倒置的事實區間是硬錯誤", () => {
  const root = vault();
  writeFileSync(
    join(root, "palace/entities/max.md"),
    "---\ntype: entity\ndescription: d\n---\n\n## Facts\n\n| predicate | object | valid_from | valid_to | confidence | source |\n|---|---|---|---|---|---|\n| lives_in | 台北 | 2026-01-01 | 2025-01-01 | 1.0 | x |\n",
  );
  const r = lintVault(nodeFileStore, root);
  expect(r.errors.some((e) => e.rule === "fact-interval")).toBe(true);
});

test("斷鏈是軟提醒不是錯誤", () => {
  const root = vault();
  writeFileSync(join(root, "n.md"), "---\ntype: note\ndescription: d\n---\n\n[尚未寫的頁](future.md)\n");
  const r = lintVault(nodeFileStore, root);
  expect(r.errors.length).toBe(0);
  expect(r.warnings.some((w) => w.rule === "broken-link")).toBe(true);
});

test("code 內的 wikilink 與連結不觸發", () => {
  const root = vault();
  writeFileSync(
    join(root, "n.md"),
    "---\ntype: note\ndescription: d\n---\n\ninline `[[example]]` 是格式範例\n\n```\n[x](nonexist.md)\n[[fenced]]\n```\n",
  );
  const r = lintVault(nodeFileStore, root);
  expect(r.errors.length).toBe(0);
  expect(r.warnings.length).toBe(0);
});

test("無前導 pipe 的表列不解析、有前導 pipe 的仍會抓", () => {
  const root = vault();
  // 兩個無前導 pipe 的行：一個倒置區間列（錯位後 to 讀到 confidence）、
  // 一個錯位後 cells[3]/cells[4] 恰為倒置日期的行（舊實作會誤報）；
  // 只有帶前導 pipe 的 works_at 列應被抓到。
  writeFileSync(
    join(root, "palace/entities/max.md"),
    "---\ntype: entity\ndescription: d\n---\n\n## Facts\n\n| predicate | object | valid_from | valid_to | confidence | source |\n|---|---|---|---|---|---|\nlives_in | 台北 | 2026-01-01 | 2025-01-01 | 1.0 | x |\np | o | x | 2026-06-01 | 2025-06-01 | c | s\n| works_at | 公司 | 2026-01-01 | 2025-01-01 | 1.0 | x |\n",
  );
  const r = lintVault(nodeFileStore, root);
  const hits = r.errors.filter((e) => e.rule === "fact-interval");
  expect(hits.length).toBe(1);
  expect(hits[0].message).toContain("2025-01-01");
});

test("palace/raw 底下的逐字檔跳過 wikilink/fact-interval/broken-link，只做 frontmatter 檢查", () => {
  const root = vault();
  mkdirSync(join(root, "palace/raw/conversations"), { recursive: true });
  writeFileSync(
    join(root, "palace/raw/conversations/sess.md"),
    "---\ntype: raw-log\ndescription: d\n---\n\n" +
      "對話裡剛好出現 [[別頁]] 與 [壞連結](nope.md)\n\n" +
      "## Facts\n\n| predicate | object | valid_from | valid_to | confidence | source |\n|---|---|---|---|---|---|\n| lives_in | 台北 | 2026-01-01 | 2025-01-01 | 1.0 | x |\n",
  );
  const r = lintVault(nodeFileStore, root);
  expect(r.errors.length).toBe(0);
  expect(r.warnings.some((w) => w.rule === "broken-link")).toBe(false);
});

test("同樣內容在 palace/raw 之外時，wikilink 與 fact-interval 仍照常報錯", () => {
  const root = vault();
  writeFileSync(
    join(root, "not-raw.md"),
    "---\ntype: note\ndescription: d\n---\n\n" +
      "對話裡剛好出現 [[別頁]]\n\n" +
      "## Facts\n\n| predicate | object | valid_from | valid_to | confidence | source |\n|---|---|---|---|---|---|\n| lives_in | 台北 | 2026-01-01 | 2025-01-01 | 1.0 | x |\n",
  );
  const r = lintVault(nodeFileStore, root);
  expect(r.errors.some((e) => e.rule === "wikilink-ban")).toBe(true);
  expect(r.errors.some((e) => e.rule === "fact-interval")).toBe(true);
});

test("checkRawImmutable：reindex 改寫的 index.md 被完全忽略", () => {
  const repo = setupRawRepo();
  writeFileSync(join(repo, "vault/palace/raw/index.md"), "# raw index（重生後）\n");
  const r = checkRawImmutable(nodeGitRunner, join(repo, "vault"), repo);
  expect(r.errors.length).toBe(0);
  expect(r.warnings.length).toBe(0);
});

test("checkRawImmutable：對話檔被修改是警告，不是錯誤", () => {
  const repo = setupRawRepo();
  writeFileSync(
    join(repo, "vault/palace/raw/conversations/sess-1.md"),
    "---\ntype: raw-log\ndescription: d\n---\n\n改過的內容\n",
  );
  const r = checkRawImmutable(nodeGitRunner, join(repo, "vault"), repo);
  expect(r.errors.length).toBe(0);
  expect(r.warnings.some((w) => w.rule === "raw-immutable" && w.file.includes("sess-1.md"))).toBe(true);
});

test("checkRawImmutable：對話檔被刪除是硬錯誤", () => {
  const repo = setupRawRepo();
  rmSync(join(repo, "vault/palace/raw/conversations/sess-1.md"));
  const r = checkRawImmutable(nodeGitRunner, join(repo, "vault"), repo);
  expect(r.errors.some((e) => e.rule === "raw-immutable" && e.file.includes("sess-1.md"))).toBe(true);
});

test("checkRawImmutable：git 指令失敗時回傳警告而非靜默略過", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "notgit-")));
  mkdirSync(join(dir, "vault/palace/raw"), { recursive: true });
  const r = checkRawImmutable(nodeGitRunner, join(dir, "vault"), dir);
  expect(r.errors.length).toBe(0);
  expect(r.warnings.some((w) => w.rule === "raw-immutable-check-failed")).toBe(true);
});
