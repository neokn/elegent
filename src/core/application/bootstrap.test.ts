import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, existsSync, lstatSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { bootstrap } from "@core/application/bootstrap";
import { nodeFileStore } from "@infrastructure/adapters/node-fs";
import { nodeGitRunner } from "@infrastructure/adapters/node-git";
import { lintVault } from "@core/application/lint";

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
  const result = bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN);

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

test("Codex 整合：.codex/hooks.json 生成、含 elegentBin、Stop/PreCompact 齊全", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-codex-"));
  const result = bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN);

  const p = join(dir, ".codex/hooks.json");
  const skill = join(dir, ".codex/skills/digest/SKILL.md");
  expect(existsSync(p)).toBe(true);
  expect(existsSync(skill)).toBe(true);
  expect(result.created).toContain(p);
  expect(result.created).toContain(skill);
  const parsed = JSON.parse(readFileSync(p, "utf8"));
  expect(parsed.hooks.Stop[0].hooks[0].command).toBe(`${ELEGENT_BIN} hook codex stop`);
  expect(parsed.hooks.PreCompact[0].hooks[0].command).toBe(`${ELEGENT_BIN} hook codex precompact`);
  expect(readFileSync(skill, "utf8")).not.toContain("{{");
});

test("Antigravity (agy) 整合：.agents/hooks.json 生成、含 elegentBin、PostInvocation 齊全", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-agy-"));
  const result = bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN);

  const p = join(dir, ".agents/hooks.json");
  expect(existsSync(p)).toBe(true);
  expect(result.created).toContain(p);
  const parsed = JSON.parse(readFileSync(p, "utf8"));
  expect(parsed["elegent-memory"].PostInvocation[0].command).toBe(`${ELEGENT_BIN} hook agy postinvocation`);
});

test("自訂 vaultName：建立指定 vault 目錄並重生索引", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-named-vault-"));
  bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN, { vaultName: "my memory" });

  expect(existsSync(join(dir, "my-memory/palace/wake/identity.md"))).toBe(true);
  expect(existsSync(join(dir, "vault"))).toBe(false);
  const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
  expect(mcp.mcpServers["elegent-memory"].env.ELEGENT_VAULT).toBe(join(dir, "my-memory"));
});

test("user scope：Claude/Codex 設定寫到指定 user dir，hook command 帶 ELEGENT_ROOT 與 vaultName", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-user-scope-"));
  const userRoot = mkdtempSync(join(tmpdir(), "elgt-user-scope-"));
  const claudeUserDir = join(userRoot, ".claude");
  const codexUserDir = join(userRoot, ".codex");
  const agyUserDir = join(userRoot, ".gemini/config");

  bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN, {
    vaultName: "memory",
    claudeScope: "user",
    codexScope: "user",
    agyScope: "user",
    claudeUserDir,
    codexUserDir,
    agyUserDir,
  });

  expect(existsSync(join(dir, ".claude/settings.json"))).toBe(false);
  expect(existsSync(join(dir, ".codex/hooks.json"))).toBe(false);
  expect(existsSync(join(dir, ".agents/hooks.json"))).toBe(false);
  expect(existsSync(join(codexUserDir, "skills/digest/SKILL.md"))).toBe(true);
  const claude = JSON.parse(readFileSync(join(claudeUserDir, "settings.json"), "utf8"));
  const codex = JSON.parse(readFileSync(join(codexUserDir, "hooks.json"), "utf8"));
  const agy = JSON.parse(readFileSync(join(agyUserDir, "hooks.json"), "utf8"));
  expect(claude.hooks.Stop[0].hooks[0].command).toContain("ELEGENT_ROOT=");
  expect(claude.hooks.Stop[0].hooks[0].command).toContain("ELEGENT_VAULT_NAME='memory'");
  expect(codex.hooks.Stop[0].hooks[0].command).toContain("ELEGENT_ROOT=");
  expect(codex.hooks.Stop[0].hooks[0].command).toContain(`${ELEGENT_BIN} hook codex stop`);
  expect(agy["elegent-memory"].PostInvocation[0].command).toContain("ELEGENT_ROOT=");
  expect(agy["elegent-memory"].PostInvocation[0].command).toContain(`${ELEGENT_BIN} hook agy postinvocation`);
});

test("agent scope none：不產生 Claude/Codex/Agy hook 設定", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-no-agent-hooks-"));
  bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN, {
    claudeScope: "none",
    codexScope: "none",
    agyScope: "none",
  });

  expect(existsSync(join(dir, ".claude/settings.json"))).toBe(false);
  expect(existsSync(join(dir, ".codex/hooks.json"))).toBe(false);
  expect(existsSync(join(dir, ".agents/hooks.json"))).toBe(false);
  expect(existsSync(join(dir, "CLAUDE.md"))).toBe(true);
});

test("多 agent context：AGENTS.md 是指向 CLAUDE.md 的 symlink、內容一致（Codex/Antigravity 拿同一份）", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-symlink-"));
  bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN);

  const claudeMd = readFileSync(join(dir, "CLAUDE.md"), "utf8");
  const p = join(dir, "AGENTS.md");
  expect(lstatSync(p).isSymbolicLink()).toBe(true);
  expect(readlinkSync(p)).toBe("CLAUDE.md");
  expect(readFileSync(p, "utf8")).toBe(claudeMd);

  // 不再產生 GEMINI.md（Gemini CLI 不在支援範圍；Antigravity/Codex 都讀 AGENTS.md）
  expect(existsSync(join(dir, "GEMINI.md"))).toBe(false);
});

test("既有 AGENTS.md（使用者自寫）不被 symlink 覆寫", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-agents-preexist-"));
  writeFileSync(join(dir, "AGENTS.md"), "# 我自己的 AGENTS\n");
  const result = bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN);
  expect(lstatSync(join(dir, "AGENTS.md")).isSymbolicLink()).toBe(false);
  expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe("# 我自己的 AGENTS\n");
  expect(result.skipped).toContain(join(dir, "AGENTS.md"));
});

test("bootstrap 後 lintVault(nodeFileStore, vault) 0 errors 0 warnings（regenerateIndexes 消除 index.md 斷鏈）", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-lint-"));
  bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN);
  const { errors, warnings } = lintVault(nodeFileStore, join(dir, "vault"));
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test("二次執行：created 空、skipped 非空、既有檔內容不變", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-twice-"));
  bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN);
  const claudeMdBefore = readFileSync(join(dir, "CLAUDE.md"), "utf8");

  const second = bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN);
  expect(second.created).toEqual([]);
  expect(second.skipped.length).toBeGreaterThan(0);
  expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe(claudeMdBefore);
});

test("既有 CLAUDE.md（先手寫一份）不被覆寫", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-preexist-"));
  writeFileSync(join(dir, "CLAUDE.md"), "# 我自己手寫的內容\n");

  const result = bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN);

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

    const result = bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN);

    expect(readFileSync(p, "utf8")).toBe(`手寫內容 ${rel}\n`);
    expect(result.skipped).toContain(p);
    expect(result.created).not.toContain(p);
  });
}

test("elegentBin 含空白（開發模式 `bun /abs/elgt.ts`）→ .mcp.json command 無空白、其餘段接進 args 前面", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-mcp-exec-"));
  bootstrap(nodeFileStore, nodeGitRunner, dir, "bun /abs/path/to/elgt.ts");

  const parsed = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
  const server = parsed.mcpServers["elegent-memory"];
  expect(server.command).toBe("bun");
  expect(server.command).not.toContain(" ");
  expect(server.args[0]).toBe("/abs/path/to/elgt.ts");
  expect(server.args).toContain("mcp");
  expect(server.args).toEqual(["/abs/path/to/elgt.ts", "mcp"]);
  expect(server.env.ELEGENT_VAULT).toBe(join(dir, "vault"));
});

test("elegentBin 不含空白（編譯後單一執行檔）→ .mcp.json command 原樣、args 只有 mcp", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-mcp-bin-"));
  bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN);

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
    const result = bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN);
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
    const result = bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN);
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
  const result = bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN);
  expect(result.warnings).toEqual([]);
});
