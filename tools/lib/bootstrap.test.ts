import { expect, test } from "bun:test";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrap } from "./bootstrap";
import { lintVault } from "./lint";

const PALACE_BIN = "/usr/local/bin/palace";

const RENDERED_RELPATHS = [
  ".claude/settings.json",
  ".claude/skills/digest/SKILL.md",
  "CLAUDE.md",
  ".mcp.json",
  ".gitignore",
];

test("空 temp dir → bootstrap：檔案齊全，settings/mcp 含 palaceBin，無 {{ 殘留", () => {
  const dir = mkdtempSync(join(tmpdir(), "palace-init-"));
  const result = bootstrap(dir, PALACE_BIN);

  expect(result.created.length).toBeGreaterThan(RENDERED_RELPATHS.length);

  for (const rel of RENDERED_RELPATHS) {
    const p = join(dir, rel);
    expect(existsSync(p)).toBe(true);
    const content = readFileSync(p, "utf8");
    expect(content).not.toContain("{{");
  }

  const settings = readFileSync(join(dir, ".claude/settings.json"), "utf8");
  expect(settings).toContain(PALACE_BIN);
  const mcp = readFileSync(join(dir, ".mcp.json"), "utf8");
  expect(mcp).toContain(PALACE_BIN);

  expect(existsSync(join(dir, "vault/palace/wake/identity.md"))).toBe(true);
});

test("bootstrap 後 lintVault(vault) 0 errors", () => {
  const dir = mkdtempSync(join(tmpdir(), "palace-init-lint-"));
  bootstrap(dir, PALACE_BIN);
  const { errors } = lintVault(join(dir, "vault"));
  expect(errors).toEqual([]);
});

test("二次執行：created 空、skipped 非空、既有檔內容不變", () => {
  const dir = mkdtempSync(join(tmpdir(), "palace-init-twice-"));
  bootstrap(dir, PALACE_BIN);
  const claudeMdBefore = readFileSync(join(dir, "CLAUDE.md"), "utf8");

  const second = bootstrap(dir, PALACE_BIN);
  expect(second.created).toEqual([]);
  expect(second.skipped.length).toBeGreaterThan(0);
  expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe(claudeMdBefore);
});

test("既有 CLAUDE.md（先手寫一份）不被覆寫", () => {
  const dir = mkdtempSync(join(tmpdir(), "palace-init-preexist-"));
  writeFileSync(join(dir, "CLAUDE.md"), "# 我自己手寫的內容\n");

  const result = bootstrap(dir, PALACE_BIN);

  expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe("# 我自己手寫的內容\n");
  expect(result.skipped).toContain(join(dir, "CLAUDE.md"));
  expect(result.created).not.toContain(join(dir, "CLAUDE.md"));
});

test("git init 成功時 .git 存在", () => {
  const dir = mkdtempSync(join(tmpdir(), "palace-init-git-"));
  bootstrap(dir, PALACE_BIN);
  expect(existsSync(join(dir, ".git"))).toBe(true);
});

test("已是 git repo（.git 已存在）→ 不重跑 git init，不產生警告", () => {
  const dir = mkdtempSync(join(tmpdir(), "palace-init-existing-git-"));
  Bun.spawnSync(["git", "init", "-b", "main"], { cwd: dir });
  const result = bootstrap(dir, PALACE_BIN);
  expect(result.warnings).toEqual([]);
});
