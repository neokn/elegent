import { expect, test } from "bun:test";
import { runStopHook, type StopDeps } from "./stop";

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

test("錯誤時仍回 {} 並記 log", () => {
  let logged = false;
  const d = deps({ archive: () => { throw new Error("boom"); }, log: () => { logged = true; } });
  const out = runStopHook({ session_id: "s1", transcript_path: "/tmp/t.jsonl" }, d);
  expect(out).toEqual({});
  expect(logged).toBe(true);
});
