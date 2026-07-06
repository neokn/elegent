import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStopHook, type StopDeps } from "./stop";

const CLI = new URL("./stop.ts", import.meta.url).pathname;

function deps(overrides: Partial<StopDeps> = {}): StopDeps & { archived: string[] } {
  const archived: string[] = [];
  return {
    archived,
    countUser: () => 20,
    readLast: () => 0,
    writeLast: () => {},
    archive: (t: string) => { archived.push(t); },
    readTranscript: () => "",
    log: () => {},
    ...overrides,
  } as StopDeps & { archived: string[] };
}

test("stop_hook_active 直接放行不歸檔", () => {
  const d = deps();
  const out = runStopHook({ session_id: "s1", transcript_path: "/tmp/t.jsonl", stop_hook_active: true }, d);
  expect(out).toEqual({});
  expect(d.archived).toEqual([]);
});

test("未達節流門檻不歸檔", () => {
  const d = deps({ countUser: () => 5 });
  runStopHook({ session_id: "s1", transcript_path: "/tmp/t.jsonl" }, d);
  expect(d.archived).toEqual([]);
});

test("達門檻歸檔並推進游標", () => {
  let saved = -1;
  const d = deps({ writeLast: (_r, _s, n) => { saved = n; } });
  runStopHook({ session_id: "s1", transcript_path: "/tmp/t.jsonl" }, d);
  expect(d.archived.length).toBe(1);
  expect(saved).toBe(20);
});

test("非法 sessionId 回 {} 且不歸檔", () => {
  const d = deps();
  const out = runStopHook({ session_id: "../evil", transcript_path: "/tmp/t.jsonl" }, d);
  expect(out).toEqual({});
  expect(d.archived).toEqual([]);
});

test("非法 transcript_path 回 {} 且不歸檔", () => {
  const d = deps();
  const out = runStopHook({ session_id: "s1", transcript_path: "/tmp/evil.txt" }, d);
  expect(out).toEqual({});
  expect(d.archived).toEqual([]);
});

test("PALACE_HEADLESS_DIGEST=1 時（子程序自我參照防護）：直接 emit {}，不歸檔", () => {
  const repo = mkdtempSync(join(tmpdir(), "stop-cli-"));
  mkdirSync(join(repo, "vault"), { recursive: true });
  const transcript = join(repo, "fake.jsonl");
  // 產生遠超過 SAVE_INTERVAL 則的 user 訊息，若沒有 headless 防護本應觸發歸檔
  const lines = Array.from({ length: 20 }, () =>
    JSON.stringify({ type: "user", timestamp: "2026-07-06T10:00:00Z", message: { role: "user", content: "hi" } }),
  ).join("\n");
  writeFileSync(transcript, lines + "\n");
  const input = JSON.stringify({ session_id: "headless-s1", transcript_path: transcript });

  const p = Bun.spawnSync(["bun", CLI], {
    cwd: repo,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo, PALACE_HEADLESS_DIGEST: "1" },
    stdin: new TextEncoder().encode(input),
  });

  expect(p.stdout.toString().trim()).toBe("{}");
  expect(existsSync(join(repo, "vault/palace/raw/conversations"))).toBe(false);
});

test("錯誤時仍回 {} 並記 log", () => {
  let logged = false;
  const d = deps({ archive: () => { throw new Error("boom"); }, log: () => { logged = true; } });
  const out = runStopHook({ session_id: "s1", transcript_path: "/tmp/t.jsonl" }, d);
  expect(out).toEqual({});
  expect(logged).toBe(true);
});
