import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, type PalaceDeps } from "./palace";
import { VERSION } from "../lib/version";

const CLI = new URL("./palace.ts", import.meta.url).pathname;

function deps(overrides: Partial<PalaceDeps> = {}): PalaceDeps {
  return {
    hooks: {
      stop: async () => 0,
      precompact: async () => 0,
      sessionend: async () => 0,
      sessionstart: async () => 0,
    },
    init: async () => 0,
    reindex: async () => 0,
    lint: async () => 0,
    guard: async () => 0,
    backfill: async () => 0,
    mcp: async () => 0,
    ...overrides,
  };
}

// --- 路由派發（mock 注入） ---

test("hook stop 派發到 deps.hooks.stop 並傳遞剩餘 argv", async () => {
  let received: string[] | undefined;
  const code = await main(
    ["hook", "stop", "--foo"],
    deps({ hooks: { stop: async (argv) => { received = argv; return 0; }, precompact: async () => 0, sessionend: async () => 0, sessionstart: async () => 0 } }),
  );
  expect(code).toBe(0);
  expect(received).toEqual(["--foo"]);
});

test("hook precompact 派發到 deps.hooks.precompact", async () => {
  let called = false;
  const code = await main(
    ["hook", "precompact"],
    deps({ hooks: { stop: async () => 0, precompact: async () => { called = true; return 0; }, sessionend: async () => 0, sessionstart: async () => 0 } }),
  );
  expect(code).toBe(0);
  expect(called).toBe(true);
});

test("hook sessionend 派發到 deps.hooks.sessionend", async () => {
  let called = false;
  const code = await main(
    ["hook", "sessionend"],
    deps({ hooks: { stop: async () => 0, precompact: async () => 0, sessionend: async () => { called = true; return 0; }, sessionstart: async () => 0 } }),
  );
  expect(code).toBe(0);
  expect(called).toBe(true);
});

test("hook sessionstart 派發到 deps.hooks.sessionstart", async () => {
  let called = false;
  const code = await main(
    ["hook", "sessionstart"],
    deps({ hooks: { stop: async () => 0, precompact: async () => 0, sessionend: async () => 0, sessionstart: async () => { called = true; return 0; } } }),
  );
  expect(code).toBe(0);
  expect(called).toBe(true);
});

test("init 派發到 deps.init 並傳遞指定的 dir", async () => {
  let received: string | undefined;
  const code = await main(["init", "/some/dir"], deps({ init: async (dir) => { received = dir; return 0; } }));
  expect(code).toBe(0);
  expect(received).toBe("/some/dir");
});

test("init 未指定 dir 時預設 process.cwd()", async () => {
  let received: string | undefined;
  const code = await main(["init"], deps({ init: async (dir) => { received = dir; return 0; } }));
  expect(code).toBe(0);
  expect(received).toBe(process.cwd());
});

test("reindex 派發到 deps.reindex 並傳遞 argv", async () => {
  let received: string[] | undefined;
  const code = await main(["reindex", "/some/vault"], deps({ reindex: async (argv) => { received = argv; return 0; } }));
  expect(code).toBe(0);
  expect(received).toEqual(["/some/vault"]);
});

test("lint 派發到 deps.lint 並回傳其 exit code", async () => {
  const code = await main(["lint"], deps({ lint: async () => 1 }));
  expect(code).toBe(1);
});

test("guard 派發到 deps.guard 並傳遞檔名", async () => {
  let received: string[] | undefined;
  const code = await main(["guard", "note.md"], deps({ guard: async (argv) => { received = argv; return 0; } }));
  expect(code).toBe(0);
  expect(received).toEqual(["note.md"]);
});

test("backfill 派發到 deps.backfill", async () => {
  let called = false;
  const code = await main(["backfill", "/projects"], deps({ backfill: async () => { called = true; return 0; } }));
  expect(called).toBe(true);
  expect(code).toBe(0);
});

test("mcp 派發到 deps.mcp（不實際啟動 server）", async () => {
  let called = false;
  const code = await main(["mcp"], deps({ mcp: async () => { called = true; return 0; } }));
  expect(called).toBe(true);
  expect(code).toBe(0);
});

// --- 錯誤情境 ---

test("未知子指令 exit 2", async () => {
  const code = await main(["bogus"], deps());
  expect(code).toBe(2);
});

test("無子指令 exit 2", async () => {
  const code = await main([], deps());
  expect(code).toBe(2);
});

test("hook 缺子指令名稱 exit 2", async () => {
  const code = await main(["hook"], deps());
  expect(code).toBe(2);
});

test("hook 未知名稱 exit 2", async () => {
  const code = await main(["hook", "bogus"], deps());
  expect(code).toBe(2);
});

// --- 真實接線（spawn 二進位；不含 mcp，避免 stdio server 卡住測試） ---

test("真實 CLI: version 印出 tools/lib/version.ts 的常數", () => {
  const p = Bun.spawnSync(["bun", CLI, "version"]);
  expect(p.exitCode).toBe(0);
  expect(p.stdout.toString().trim()).toBe(VERSION);
});

test("真實 CLI: 未知指令 exit 2 且 usage 印到 stderr", () => {
  const p = Bun.spawnSync(["bun", CLI, "bogus"]);
  expect(p.exitCode).toBe(2);
  expect(p.stderr.toString().length).toBeGreaterThan(0);
});

test("真實 CLI: hook sessionstart 走真實入口（讀 stdin、輸出合法 JSON）", () => {
  const repo = mkdtempSync(join(tmpdir(), "palace-cli-"));
  mkdirSync(join(repo, "vault/palace/wake"), { recursive: true });
  writeFileSync(join(repo, "vault/palace/wake/identity.md"), "---\ntype: wake\n---\n\n# Identity\n");
  const p = Bun.spawnSync(["bun", CLI, "hook", "sessionstart"], {
    cwd: repo,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
    stdin: new TextEncoder().encode("{}"),
  });
  expect(p.exitCode).toBe(0);
  expect(() => JSON.parse(p.stdout.toString().trim())).not.toThrow();
});

test("真實 CLI: lint 走真實入口（vault 骨架 0 errors）", () => {
  const repo = mkdtempSync(join(tmpdir(), "palace-cli-lint-"));
  Bun.spawnSync(["bun", new URL("./scaffold.ts", import.meta.url).pathname, join(repo, "vault")]);
  const p = Bun.spawnSync(["bun", CLI, "lint", join(repo, "vault")], { cwd: repo });
  expect(p.exitCode).toBe(0);
  expect(p.stdout.toString()).toContain("0 errors");
});

test("真實 CLI: hook 缺子指令 exit 2", () => {
  const p = Bun.spawnSync(["bun", CLI, "hook"]);
  expect(p.exitCode).toBe(2);
});

test("真實 CLI: init 走真實入口——空 temp dir 建立完整記憶系統，stdout 含下一步指引", () => {
  const dir = mkdtempSync(join(tmpdir(), "palace-cli-init-"));
  const p = Bun.spawnSync(["bun", CLI, "init", dir]);
  expect(p.exitCode).toBe(0);
  const out = p.stdout.toString();
  expect(out).toContain("identity.md");
  expect(out).toContain("Obsidian");
  expect(out).toContain("MCP");
  expect(existsSync(join(dir, "CLAUDE.md"))).toBe(true);
  expect(existsSync(join(dir, ".git"))).toBe(true);
});
