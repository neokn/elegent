import { expect, test } from "bun:test";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SAVE_INTERVAL, countUserMessages, readLastSave, writeLastSave, clearSession, logHookError } from "./state";

test("countUserMessages 跳過 tool_result 與 slash command", () => {
  const jsonl = [
    JSON.stringify({ type: "user", message: { content: "正常訊息" } }),
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "x" }] } }),
    JSON.stringify({ type: "user", message: { content: "<command-message>digest</command-message>" } }),
    JSON.stringify({ type: "assistant", message: { content: "回應" } }),
  ].join("\n");
  expect(countUserMessages(jsonl)).toBe(1);
  expect(SAVE_INTERVAL).toBe(15);
});

test("last_save 游標讀寫與清除", () => {
  const root = mkdtempSync(join(tmpdir(), "state-"));
  expect(readLastSave(root, "s1")).toBe(0);
  writeLastSave(root, "s1", 15);
  expect(readLastSave(root, "s1")).toBe(15);
  clearSession(root, "s1");
  expect(readLastSave(root, "s1")).toBe(0);
});

test("logHookError 附加到 hooks.log", () => {
  const root = mkdtempSync(join(tmpdir(), "state-"));
  logHookError(root, "stop", new Error("boom"));
  const log = readFileSync(join(root, ".palace-state/hooks.log"), "utf8");
  expect(log).toContain("stop");
  expect(log).toContain("boom");
});
