import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { bootstrap } from "./bootstrap";
import { lintVault } from "./lint";

const ELEGENT_BIN = "/usr/local/bin/elgt";

const RENDERED_RELPATHS = [
  ".claude/settings.json",
  ".claude/skills/digest/SKILL.md",
  "CLAUDE.md",
  ".mcp.json",
  ".gitignore",
];

test("空 temp dir → bootstrap：檔案齊全，settings/mcp 含 elegentBin，無 {{ 殘留", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-"));
  const result = bootstrap(dir, ELEGENT_BIN);

  expect(result.created.length).toBeGreaterThan(RENDERED_RELPATHS.length);

  for (const rel of RENDERED_RELPATHS) {
    const p = join(dir, rel);
    expect(existsSync(p)).toBe(true);
    const content = readFileSync(p, "utf8");
    expect(content).not.toContain("{{");
  }

  const settings = readFileSync(join(dir, ".claude/settings.json"), "utf8");
  expect(settings).toContain(ELEGENT_BIN);
  const mcp = readFileSync(join(dir, ".mcp.json"), "utf8");
  expect(mcp).toContain(ELEGENT_BIN);

  expect(existsSync(join(dir, "vault/palace/wake/identity.md"))).toBe(true);
});

test("bootstrap 後 lintVault(vault) 0 errors 0 warnings（regenerateIndexes 消除 index.md 斷鏈）", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-lint-"));
  bootstrap(dir, ELEGENT_BIN);
  const { errors, warnings } = lintVault(join(dir, "vault"));
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test("二次執行：created 空、skipped 非空、既有檔內容不變", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-twice-"));
  bootstrap(dir, ELEGENT_BIN);
  const claudeMdBefore = readFileSync(join(dir, "CLAUDE.md"), "utf8");

  const second = bootstrap(dir, ELEGENT_BIN);
  expect(second.created).toEqual([]);
  expect(second.skipped.length).toBeGreaterThan(0);
  expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe(claudeMdBefore);
});

test("既有 CLAUDE.md（先手寫一份）不被覆寫", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-preexist-"));
  writeFileSync(join(dir, "CLAUDE.md"), "# 我自己手寫的內容\n");

  const result = bootstrap(dir, ELEGENT_BIN);

  expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe("# 我自己手寫的內容\n");
  expect(result.skipped).toContain(join(dir, "CLAUDE.md"));
  expect(result.created).not.toContain(join(dir, "CLAUDE.md"));
});

// 參數化：五個 rendered 檔任一既有都不被覆寫（每個檔各自獨立驗證）
for (const rel of RENDERED_RELPATHS) {
  test(`既有 ${rel} 不被覆寫且進 skipped`, () => {
    const dir = mkdtempSync(join(tmpdir(), "elgt-init-preexist-each-"));
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, `手寫內容 ${rel}\n`);

    const result = bootstrap(dir, ELEGENT_BIN);

    expect(readFileSync(p, "utf8")).toBe(`手寫內容 ${rel}\n`);
    expect(result.skipped).toContain(p);
    expect(result.created).not.toContain(p);
  });
}

test("elegentBin 含空白（開發模式 `bun /abs/elgt.ts`）→ .mcp.json command 無空白、其餘段接進 args 前面", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-mcp-exec-"));
  bootstrap(dir, "bun /abs/path/to/elgt.ts");

  const parsed = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
  const server = parsed.mcpServers["elegent-memory"];
  expect(server.command).toBe("bun");
  expect(server.command).not.toContain(" ");
  expect(server.args[0]).toBe("/abs/path/to/elgt.ts");
  expect(server.args).toContain("mcp");
  expect(server.args).toEqual(["/abs/path/to/elgt.ts", "mcp"]);
});

test("elegentBin 不含空白（編譯後單一執行檔）→ .mcp.json command 原樣、args 只有 mcp", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-mcp-bin-"));
  bootstrap(dir, ELEGENT_BIN);

  const parsed = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
  const server = parsed.mcpServers["elegent-memory"];
  expect(server.command).toBe(ELEGENT_BIN);
  expect(server.args).toEqual(["mcp"]);
});

test("git init 成功時 .git 存在，且有初始 commit（git rev-parse HEAD 成功）", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-git-"));
  // 固定 author/committer 身份（透過環境變數，不動全域 git config），確保這個斷言
  // 不受執行環境是否已設定 git identity 影響——bootstrap 內部的 spawnSync 沒有覆寫
  // env，會照樣繼承這裡設定的值。
  const keys = ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"] as const;
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) prev[k] = process.env[k];
  process.env.GIT_AUTHOR_NAME = "elgt-test";
  process.env.GIT_AUTHOR_EMAIL = "elgt-test@example.com";
  process.env.GIT_COMMITTER_NAME = "elgt-test";
  process.env.GIT_COMMITTER_EMAIL = "elgt-test@example.com";
  try {
    const result = bootstrap(dir, ELEGENT_BIN);
    expect(existsSync(join(dir, ".git"))).toBe(true);
    expect(result.warnings).toEqual([]);
    const rev = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: dir });
    expect(rev.exitCode).toBe(0);
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
});

test("git identity 無法解析時（user.useConfigOnly）commit 失敗只警告，不 throw（.git 仍存在）", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-git-noident-"));
  // 用 useConfigOnly=true 關掉 git 的 username/hostname 自動 fallback（現代 git 預設會
  // 自動猜身份、不會真的失敗），逼 commit 真的因缺 identity 失敗，驗證 warnings 訊息。
  const fakeGlobalConfig = join(mkdtempSync(join(tmpdir(), "elgt-init-git-fakecfg-")), "gitconfig");
  writeFileSync(fakeGlobalConfig, "[user]\n\tuseConfigOnly = true\n");

  const keys = ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"] as const;
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) prev[k] = process.env[k];
  for (const k of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"] as const) delete process.env[k];
  process.env.GIT_CONFIG_GLOBAL = fakeGlobalConfig;
  process.env.GIT_CONFIG_SYSTEM = "/dev/null";
  try {
    const result = bootstrap(dir, ELEGENT_BIN);
    expect(existsSync(join(dir, ".git"))).toBe(true);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("git identity");
    const rev = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: dir });
    expect(rev.exitCode).not.toBe(0); // 沒有初始 commit
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
});

test("已是 git repo（.git 已存在）→ 不重跑 git init，不產生警告", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-existing-git-"));
  Bun.spawnSync(["git", "init", "-b", "main"], { cwd: dir });
  const result = bootstrap(dir, ELEGENT_BIN);
  expect(result.warnings).toEqual([]);
});
