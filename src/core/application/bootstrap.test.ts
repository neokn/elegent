import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, dirname } from "node:path";
import { bootstrap } from "@core/application/bootstrap";
import { nodeFileStore } from "@infrastructure/adapters/node-fs";
import { nodeGitRunner } from "@infrastructure/adapters/node-git";
import { lintVault } from "@core/application/lint";
import type { McpRegistrar, McpRegisterOpts } from "@core/ports";

const ELEGENT_BIN = "/usr/local/bin/elgt";

const RENDERED_RELPATHS = [
  ".claude/settings.json",
  ".claude/skills/digest/SKILL.md",
  ".gitignore",
];
const SKIP_IF_EXISTS_RELPATHS = [
  ".claude/skills/digest/SKILL.md",
  ".gitignore",
];

const noopRegistrar: McpRegistrar = {
  claudeUserServerExists: () => false,
  codexUserServerExists: () => false,
  registerClaude: () => ({ ok: true, detail: "" }),
  registerCodex: () => ({ ok: true, detail: "" }),
};

function boot(dir: string, opts: Parameters<typeof bootstrap>[5] = {}) {
  return bootstrap(nodeFileStore, nodeGitRunner, noopRegistrar, dir, ELEGENT_BIN, opts);
}

function fakeRegistrar(userExists = false) {
  const calls: Array<{ agent: string; opts: McpRegisterOpts }> = [];
  const reg: McpRegistrar = {
    claudeUserServerExists: () => userExists,
    codexUserServerExists: () => userExists,
    registerClaude: (opts) => {
      calls.push({ agent: "claude", opts });
      return { ok: true, detail: "" };
    },
    registerCodex: (opts) => {
      calls.push({ agent: "codex", opts });
      return { ok: true, detail: "" };
    },
  };
  return { reg, calls };
}

test("project scope → bootstrap：檔案齊全，settings 含 elegentBin，無 {{ 殘留，不產人設檔與 .mcp.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-"));
  const result = boot(dir, { claudeScope: "project", codexScope: "none", agyScope: "none" });

  expect(result.created.length).toBeGreaterThan(RENDERED_RELPATHS.length);

  for (const rel of RENDERED_RELPATHS) {
    const p = join(dir, rel);
    expect(existsSync(p)).toBe(true);
    const content = readFileSync(p, "utf8");
    expect(content).not.toContain("{{");
  }

  const settings = readFileSync(join(dir, ".claude/settings.json"), "utf8");
  expect(settings).toContain(ELEGENT_BIN);

  expect(existsSync(join(dir, `${basename(dir)}.vault/palace/wake/identity.md`))).toBe(true);
  expect(existsSync(join(dir, "CLAUDE.md"))).toBe(false);
  expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
  expect(existsSync(join(dir, ".mcp.json"))).toBe(false);
});

test("Codex 整合：.codex/hooks.json 生成、含 elegentBin、Stop/PreCompact 齊全", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-codex-"));
  const result = boot(dir, { claudeScope: "none", codexScope: "project", agyScope: "none" });

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
  const result = boot(dir, { claudeScope: "none", codexScope: "none", agyScope: "project" });

  const p = join(dir, ".agents/hooks.json");
  const skill = join(dir, ".agents/skills/digest/SKILL.md");
  expect(existsSync(p)).toBe(true);
  expect(existsSync(skill)).toBe(true);
  expect(result.created).toContain(p);
  expect(result.created).toContain(skill);
  const parsed = JSON.parse(readFileSync(p, "utf8"));
  expect(parsed["elegent-memory"].PostInvocation[0].command).toBe(`${ELEGENT_BIN} hook agy postinvocation`);
});

test("自訂 vaultName：建立指定 vault 目錄並重生索引", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-named-vault-"));
  boot(dir, { vaultName: "my memory", claudeScope: "user", codexScope: "none", agyScope: "none" });

  expect(existsSync(join(dir, "my-memory/palace/wake/identity.md"))).toBe(true);
  expect(existsSync(join(dir, "vault"))).toBe(false);
});

test("user scope：Claude/Codex 設定寫到指定 user dir，hook command 帶 ELEGENT_ROOT 與 vaultName", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-user-scope-"));
  const userRoot = mkdtempSync(join(tmpdir(), "elgt-user-scope-"));
  const claudeUserDir = join(userRoot, ".claude");
  const codexUserDir = join(userRoot, ".codex");
  const agyUserDir = join(userRoot, ".gemini/config");

  boot(dir, {
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
  expect(existsSync(join(agyUserDir, "skills/digest/SKILL.md"))).toBe(true);
  const claude = JSON.parse(readFileSync(join(claudeUserDir, "settings.json"), "utf8"));
  const codex = JSON.parse(readFileSync(join(codexUserDir, "hooks.json"), "utf8"));
  const agy = JSON.parse(readFileSync(join(agyUserDir, "hooks.json"), "utf8"));
  const agyMcp = JSON.parse(readFileSync(join(agyUserDir, "mcp_config.json"), "utf8"));
  expect(claude.hooks.Stop[0].hooks[0].command).toContain("ELEGENT_ROOT=");
  expect(claude.hooks.Stop[0].hooks[0].command).toContain("ELEGENT_VAULT_NAME='memory'");
  expect(codex.hooks.Stop[0].hooks[0].command).toContain("ELEGENT_ROOT=");
  expect(codex.hooks.Stop[0].hooks[0].command).toContain(`${ELEGENT_BIN} hook codex stop`);
  expect(agy["elegent-memory"].PostInvocation[0].command).toContain("ELEGENT_ROOT=");
  expect(agy["elegent-memory"].PostInvocation[0].command).toContain(`${ELEGENT_BIN} hook agy postinvocation`);
  expect(agyMcp.mcpServers["elegent-memory"].env.ELEGENT_VAULT).toBe(join(dir, "memory"));
});

test("agent scope none：不產生 Claude/Codex/Agy hook 設定", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-no-agent-hooks-"));
  boot(dir, {
    claudeScope: "none",
    codexScope: "none",
    agyScope: "none",
  });

  expect(existsSync(join(dir, ".claude/settings.json"))).toBe(false);
  expect(existsSync(join(dir, ".codex/hooks.json"))).toBe(false);
  expect(existsSync(join(dir, ".agents/hooks.json"))).toBe(false);
  expect(existsSync(join(dir, "CLAUDE.md"))).toBe(false);
});

test("bootstrap 後 lintVault(nodeFileStore, vault) 0 errors 0 warnings（regenerateIndexes 消除 index.md 斷鏈）", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-lint-"));
  boot(dir, { claudeScope: "none", codexScope: "none", agyScope: "none" });
  const { errors, warnings } = lintVault(nodeFileStore, join(dir, "vault"));
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test("二次執行：created 空、skipped 非空、既有檔內容不變", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-init-twice-"));
  boot(dir, { claudeScope: "project", codexScope: "none", agyScope: "none" });
  const gitignoreBefore = readFileSync(join(dir, ".gitignore"), "utf8");

  const second = boot(dir, { claudeScope: "project", codexScope: "none", agyScope: "none" });
  expect(second.created).toEqual([]);
  expect(second.skipped.length).toBeGreaterThan(0);
  expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe(gitignoreBefore);
});

// 參數化：skip-if-exists 檔任一既有都不被覆寫（hooks 設定檔改由 merge 測試覆蓋）
for (const rel of SKIP_IF_EXISTS_RELPATHS) {
  test(`既有 ${rel} 不被覆寫且進 skipped`, () => {
    const dir = mkdtempSync(join(tmpdir(), "elgt-init-preexist-each-"));
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, `手寫內容 ${rel}\n`);

    const result = boot(dir, { claudeScope: "project", codexScope: "none", agyScope: "none" });

    expect(readFileSync(p, "utf8")).toBe(`手寫內容 ${rel}\n`);
    expect(result.skipped).toContain(p);
    expect(result.created).not.toContain(p);
  });
}

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
    const result = boot(dir, { claudeScope: "none", codexScope: "none", agyScope: "none" });
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
    const result = boot(dir, { claudeScope: "none", codexScope: "none", agyScope: "none" });
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
  const result = boot(dir, { claudeScope: "none", codexScope: "none", agyScope: "none" });
  expect(result.warnings).toEqual([]);
});

test("user scope：既有 ~/.claude/settings.json 被合併保留、加上我方 hook", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-merge-"));
  const userRoot = mkdtempSync(join(tmpdir(), "elgt-merge-user-"));
  const claudeUserDir = join(userRoot, ".claude");
  mkdirSync(claudeUserDir, { recursive: true });
  writeFileSync(join(claudeUserDir, "settings.json"), JSON.stringify({ model: "sonnet" }));

  boot(dir, { claudeScope: "user", codexScope: "none", agyScope: "none", claudeUserDir });

  const s = JSON.parse(readFileSync(join(claudeUserDir, "settings.json"), "utf8"));
  expect(s.model).toBe("sonnet");
  expect(s.hooks.Stop[0].hooks[0].command).toContain("hook claude stop");
});

test("local scope：建 .<slug>.vault、加入 .gitignore、Claude hooks 進 settings.local.json", () => {
  const parent = mkdtempSync(join(tmpdir(), "elgt-local-"));
  const dir = join(parent, "my-app");
  mkdirSync(dir);
  boot(dir, { claudeScope: "local", codexScope: "none", agyScope: "none" });
  expect(existsSync(join(dir, ".my-app.vault/palace/wake/identity.md"))).toBe(true);
  expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain(".my-app.vault/");
  expect(existsSync(join(dir, ".claude/settings.local.json"))).toBe(true);
  expect(existsSync(join(dir, ".claude/settings.json"))).toBe(false);
  expect(readFileSync(join(dir, ".gitignore"), "utf8")).not.toContain(".claude");
});

test("project scope：建 <slug>.vault（可見）、不進 gitignore", () => {
  const parent = mkdtempSync(join(tmpdir(), "elgt-proj-"));
  const dir = join(parent, "my-app");
  mkdirSync(dir);
  boot(dir, { claudeScope: "project", codexScope: "none", agyScope: "none" });
  expect(existsSync(join(dir, "my-app.vault/palace/wake/identity.md"))).toBe(true);
  const gi = readFileSync(join(dir, ".gitignore"), "utf8");
  expect(gi).not.toContain("my-app.vault/");
});

test("混用 local+project → throw", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-mix-"));
  expect(() => boot(dir, { claudeScope: "local", codexScope: "project", agyScope: "none" })).toThrow(/local.*project|混用/);
});

test("user scope：呼叫 registerClaude --scope user", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-reg-user-"));
  const { reg, calls } = fakeRegistrar();
  bootstrap(nodeFileStore, nodeGitRunner, reg, dir, ELEGENT_BIN, {
    claudeScope: "user",
    codexScope: "none",
    agyScope: "none",
    claudeUserDir: join(dir, ".claude"),
  });
  const c = calls.find((x) => x.agent === "claude");
  expect(c?.opts.scope).toBe("user");
});

test("local scope + 已有 user server：跳過 local 註冊", () => {
  const parent = mkdtempSync(join(tmpdir(), "elgt-reg-local-skip-"));
  const dir = join(parent, "app");
  mkdirSync(dir);
  const { reg, calls } = fakeRegistrar(true);
  bootstrap(nodeFileStore, nodeGitRunner, reg, dir, ELEGENT_BIN, {
    claudeScope: "local",
    codexScope: "none",
    agyScope: "none",
  });
  expect(calls.find((x) => x.agent === "claude")).toBeUndefined();
});

test("local scope + 無 user server：註冊 --scope local，ELEGENT_VAULT 指向嵌入 vault", () => {
  const parent = mkdtempSync(join(tmpdir(), "elgt-reg-local-"));
  const dir = join(parent, "app");
  mkdirSync(dir);
  const { reg, calls } = fakeRegistrar(false);
  bootstrap(nodeFileStore, nodeGitRunner, reg, dir, ELEGENT_BIN, {
    claudeScope: "local",
    codexScope: "none",
    agyScope: "none",
  });
  const c = calls.find((x) => x.agent === "claude");
  expect(c?.opts.scope).toBe("local");
  expect(c?.opts.vaultRoot).toBe(join(dir, ".app.vault"));
});
