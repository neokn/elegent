import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldSpawnDigest, spawnAutoDigest } from "./autodigest";

test("無 lock 時可 spawn，lock 含存活 PID 時跳過", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  expect(shouldSpawnDigest(root)).toBe(true);
  mkdirSync(join(root, ".palace-state"), { recursive: true });
  writeFileSync(join(root, ".palace-state/digest.lock"), String(process.pid)); // 用本測試程序 PID 模擬存活
  expect(shouldSpawnDigest(root)).toBe(false);
});

test("lock 含死 PID 視為過期", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  mkdirSync(join(root, ".palace-state"), { recursive: true });
  writeFileSync(join(root, ".palace-state/digest.lock"), "999999");
  expect(shouldSpawnDigest(root)).toBe(true);
});

test("lock 內容為壞值時視為過期", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  mkdirSync(join(root, ".palace-state"), { recursive: true });
  writeFileSync(join(root, ".palace-state/digest.lock"), "not-a-pid");
  expect(shouldSpawnDigest(root)).toBe(true);
});

test("shouldSpawnDigest 會自建 .palace-state 目錄", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  expect(shouldSpawnDigest(root)).toBe(true);
});

test("spawnAutoDigest 呼叫注入的 spawn，帶正確指令/cwd/stdio，並把子程序 PID 寫入 lock", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  let calledCmd: string[] | undefined;
  let calledOpts: { cwd: string; stdio: [string, string, string] } | undefined;
  let unrefCalled = false;
  const fakeSpawn = (cmd: string[], opts: { cwd: string; stdio: [string, string, string] }) => {
    calledCmd = cmd;
    calledOpts = opts;
    return { pid: 4242, unref: () => { unrefCalled = true; } };
  };

  spawnAutoDigest(root, fakeSpawn);

  expect(calledCmd).toEqual(["claude", "-p", "/digest", "--permission-mode", "acceptEdits"]);
  expect(calledOpts?.cwd).toBe(root);
  expect(calledOpts?.stdio).toEqual(["ignore", "ignore", "ignore"]);
  expect(unrefCalled).toBe(true);
  expect(readFileSync(join(root, ".palace-state/digest.lock"), "utf8")).toBe("4242");
});

test("spawnAutoDigest 之後，shouldSpawnDigest 對存活子程序回 false", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  const fakeSpawn = (_cmd: string[], _opts: { cwd: string; stdio: [string, string, string] }) => ({
    pid: process.pid, // 用本測試程序 PID 模擬「子程序仍存活」
    unref: () => {},
  });

  spawnAutoDigest(root, fakeSpawn);

  expect(shouldSpawnDigest(root)).toBe(false);
});
