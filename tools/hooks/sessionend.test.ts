import { expect, test } from "bun:test";
import { runSessionEndHook } from "./sessionend";

test("歸檔並清除 session 游標", () => {
  const archived: string[] = [];
  let cleared = false;
  const out = runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    {
      archive: (t) => { archived.push(t); },
      clear: () => { cleared = true; },
      log: () => {},
    },
  );
  expect(out).toEqual({});
  expect(archived.length).toBe(1);
  expect(cleared).toBe(true);
});

test("歸檔失敗仍清游標且回 {}", () => {
  let cleared = false;
  const out = runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    { archive: () => { throw new Error("x"); }, clear: () => { cleared = true; }, log: () => {} },
  );
  expect(out).toEqual({});
  expect(cleared).toBe(true);
});

test("archive 成功後呼叫 onArchived", () => {
  let archivedOk = false;
  runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    { archive: () => {}, clear: () => {}, log: () => {}, onArchived: () => { archivedOk = true; } },
  );
  expect(archivedOk).toBe(true);
});

test("archive throw 時 onArchived 不被呼叫", () => {
  let archivedOk = false;
  runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    {
      archive: () => { throw new Error("x"); },
      clear: () => {},
      log: () => {},
      onArchived: () => { archivedOk = true; },
    },
  );
  expect(archivedOk).toBe(false);
});

test("無 transcript_path 時 onArchived 不被呼叫", () => {
  let archivedOk = false;
  runSessionEndHook(
    { session_id: "s1" },
    { archive: () => {}, clear: () => {}, log: () => {}, onArchived: () => { archivedOk = true; } },
  );
  expect(archivedOk).toBe(false);
});

test("archive 成功後呼叫 reindex", () => {
  let reindexed = 0;
  runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    { archive: () => {}, clear: () => {}, log: () => {}, reindex: () => { reindexed++; } },
  );
  expect(reindexed).toBe(1);
});

test("archive throw 時 reindex 不被呼叫", () => {
  let reindexed = 0;
  runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    { archive: () => { throw new Error("x"); }, clear: () => {}, log: () => {}, reindex: () => { reindexed++; } },
  );
  expect(reindexed).toBe(0);
});

test("無 transcript_path 時 reindex 不被呼叫", () => {
  let reindexed = 0;
  runSessionEndHook(
    { session_id: "s1" },
    { archive: () => {}, clear: () => {}, log: () => {}, reindex: () => { reindexed++; } },
  );
  expect(reindexed).toBe(0);
});

test("reindex 拋錯不擋：仍清游標且回 {}", () => {
  let cleared = false;
  const logged: string[] = [];
  const out = runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    {
      archive: () => {},
      clear: () => { cleared = true; },
      log: (h) => { logged.push(h); },
      reindex: () => { throw new Error("reindex boom"); },
    },
  );
  expect(out).toEqual({});
  expect(cleared).toBe(true);
  expect(logged).toContain("sessionend:reindex");
});
