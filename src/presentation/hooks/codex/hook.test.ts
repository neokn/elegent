import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCodexArchiveHook, type CodexHookDeps } from "./hook";
import type { RenderedCodexTranscript } from "@core/application/transcript/codex";

const CLI = new URL("./precompact.ts", import.meta.url).pathname;

const rendered: RenderedCodexTranscript = {
  markdown: "### User\n\nhello\n",
  sessionId: "codex-s1",
  projectSlug: "elegent",
  date: "2026-07-07",
  title: "hello",
  cwd: "/repo",
};

function deps(overrides: Partial<CodexHookDeps> = {}): CodexHookDeps & { archived: string[]; saved: number[]; logged: string[] } {
  const archived: string[] = [];
  const saved: number[] = [];
  const logged: string[] = [];
  return {
    archived,
    saved,
    logged,
    findTranscript: () => ({ path: "/tmp/codex.jsonl", sessionId: "codex-s1" }),
    readTranscript: () => "jsonl",
    render: () => rendered,
    countUser: () => 20,
    readLast: () => 0,
    writeLast: (_root, _sid, n) => { saved.push(n); },
    archive: (path) => { archived.push(path); return true; },
    reindex: () => {},
    log: (hook) => { logged.push(hook); },
    ...overrides,
  } as CodexHookDeps & { archived: string[]; saved: number[]; logged: string[] };
}

test("Codex Stop：短對話也會歸檔並推進游標", () => {
  const d = deps({ countUser: () => 5 });
  runCodexArchiveHook({}, "stop", d);
  expect(d.archived).toEqual(["/tmp/codex.jsonl"]);
  expect(d.saved).toEqual([5]);
});

test("Codex Stop：沒有新增 user message 時不重複歸檔", () => {
  const d = deps({ countUser: () => 5, readLast: () => 5 });
  runCodexArchiveHook({}, "stop", d);
  expect(d.archived).toEqual([]);
  expect(d.saved).toEqual([]);
});

test("Codex PreCompact：無條件歸檔", () => {
  const d = deps({ countUser: () => 1 });
  runCodexArchiveHook({}, "precompact", d);
  expect(d.archived).toEqual(["/tmp/codex.jsonl"]);
  expect(d.saved).toEqual([1]);
});

test("Codex hook：找不到 transcript 時不做事", () => {
  const d = deps({ findTranscript: () => null });
  runCodexArchiveHook({}, "stop", d);
  expect(d.archived).toEqual([]);
});

test("Codex hook：錯誤被吞掉並記 log", () => {
  const d = deps({ archive: () => { throw new Error("boom"); } });
  runCodexArchiveHook({}, "precompact", d);
  expect(d.logged).toEqual(["codex:precompact"]);
});

function findMd(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findMd(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

test("Codex hook entry：從子目錄啟動仍寫回 git root 的 vault", () => {
  const repo = mkdtempSync(join(tmpdir(), "codex-hook-entry-"));
  const subdir = join(repo, "subdir");
  const codexHome = mkdtempSync(join(tmpdir(), "codex-home-"));
  const sessionDir = join(codexHome, "sessions/2026/07/07");
  mkdirSync(subdir, { recursive: true });
  mkdirSync(join(repo, "vault"), { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  Bun.spawnSync(["git", "init"], { cwd: repo });

  const sid = "019f3cba-5f37-75d2-9b61-909b75673fde";
  writeFileSync(
    join(sessionDir, `rollout-${sid}.jsonl`),
    [
      JSON.stringify({ timestamp: "2026-07-07T13:00:00Z", type: "session_meta", payload: { session_id: sid, cwd: repo } }),
      JSON.stringify({ timestamp: "2026-07-07T13:00:01Z", type: "event_msg", payload: { type: "user_message", message: "hello from codex" } }),
      JSON.stringify({ timestamp: "2026-07-07T13:00:02Z", type: "event_msg", payload: { type: "agent_message", message: "hello" } }),
    ].join("\n") + "\n",
  );

  const p = Bun.spawnSync(["bun", CLI], {
    cwd: subdir,
    env: { ...process.env, CODEX_HOME: codexHome },
    stdin: new TextEncoder().encode("{}"),
  });

  expect(p.exitCode).toBe(0);
  const files = findMd(join(repo, "vault/pensieve/ankipan/conversations")).filter((p) => !p.endsWith("/index.md"));
  expect(files.length).toBe(1);
  expect(existsSync(files[0])).toBe(true);
});
