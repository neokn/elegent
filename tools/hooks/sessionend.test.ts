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
