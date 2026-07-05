import { expect, test } from "bun:test";
import { runPreCompactHook } from "./precompact";

test("無條件歸檔", () => {
  const archived: string[] = [];
  const out = runPreCompactHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    {
      countUser: () => 2, // 遠低於節流門檻仍要歸檔
      readLast: () => 0,
      writeLast: () => {},
      archive: (t) => { archived.push(t); },
      readTranscript: () => "",
      log: () => {},
    },
  );
  expect(out).toEqual({});
  expect(archived.length).toBe(1);
});

test("錯誤時回 {} 不 throw", () => {
  const out = runPreCompactHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    { countUser: () => 0, readLast: () => 0, writeLast: () => {}, archive: () => { throw new Error("x"); }, readTranscript: () => "", log: () => {} },
  );
  expect(out).toEqual({});
});
