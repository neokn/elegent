import { expect, test } from "bun:test";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SAVE_INTERVAL, readLastSave, writeLastSave, clearSession, logHookError } from "./state";

test("SAVE_INTERVAL 為 1（每有新 user 訊息即歸檔）", () => {
  expect(SAVE_INTERVAL).toBe(1);
});

test("last_save 游標讀寫與清除", () => {
  const root = mkdtempSync(join(tmpdir(), "state-"));
  expect(readLastSave(root, "s1")).toBe(0);
  writeLastSave(root, "s1", 15);
  expect(readLastSave(root, "s1")).toBe(15);
  clearSession(root, "s1");
  expect(readLastSave(root, "s1")).toBe(0);
});

test("非法 sessionId 應 throw（路徑遍歷防禦）", () => {
  const root = mkdtempSync(join(tmpdir(), "state-"));
  expect(() => readLastSave(root, "../evil")).toThrow();
  expect(() => clearSession(root, "../evil")).toThrow();
});

test("marker 內容為壞值時回 0", () => {
  const root = mkdtempSync(join(tmpdir(), "state-"));
  writeLastSave(root, "s1", 15);
  writeFileSync(join(root, ".elegent-state", "s1_last_save"), "15garbage");
  expect(readLastSave(root, "s1")).toBe(0);
});

test("logHookError 附加到 hooks.log", () => {
  const root = mkdtempSync(join(tmpdir(), "state-"));
  logHookError(root, "stop", new Error("boom"));
  const log = readFileSync(join(root, ".elegent-state/hooks.log"), "utf8");
  expect(log).toContain("stop");
  expect(log).toContain("boom");
});
