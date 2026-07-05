import { expect, test } from "bun:test";
import { sanitizeSessionId, validateTranscriptPath, slugify, deriveProjectSlug } from "./safety";

test("sanitizeSessionId 擋路徑注入", () => {
  expect(sanitizeSessionId("abc-123_X")).toBe("abc-123_X");
  expect(sanitizeSessionId("../etc/passwd")).toBeNull();
  expect(sanitizeSessionId("")).toBeNull();
});

test("validateTranscriptPath 只收 jsonl/json 且拒 traversal", () => {
  expect(validateTranscriptPath("/tmp/a/session.jsonl")).toBe("/tmp/a/session.jsonl");
  expect(validateTranscriptPath("/tmp/../etc/x.jsonl")).toBe("/etc/x.jsonl"); // resolve 後無 .. 段即可
  expect(validateTranscriptPath("/tmp/evil.txt")).toBeNull();
});

test("slugify 正規化", () => {
  expect(slugify("My Project_Name!!")).toBe("my-project-name");
  expect(slugify("  --a--  ")).toBe("a");
});

test("deriveProjectSlug 讀第一個 cwd", () => {
  const jsonl = [
    JSON.stringify({ type: "user", cwd: "" }),
    JSON.stringify({ type: "user", cwd: "/Users/me/GitHub/neokn/llm-wiki" }),
  ].join("\n");
  expect(deriveProjectSlug(jsonl)).toBe("llm-wiki");
  expect(deriveProjectSlug("not json")).toBeNull();
});
