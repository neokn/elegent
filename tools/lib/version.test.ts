import { afterEach, expect, test } from "bun:test";
import { isCompiledRuntime, VERSION } from "./version";

afterEach(() => {
  delete process.env.ELEGENT_COMPILED;
});

test("VERSION 是非空字串", () => {
  expect(typeof VERSION).toBe("string");
  expect(VERSION.length).toBeGreaterThan(0);
});

test("isCompiledRuntime：無 ELEGENT_COMPILED 時，execPath 以 /bun 結尾視為開發模式", () => {
  expect(isCompiledRuntime("/usr/local/bin/bun")).toBe(false);
});

test("isCompiledRuntime：無 ELEGENT_COMPILED 時，execPath 以 /bun.exe 結尾視為開發模式", () => {
  expect(isCompiledRuntime("C:/Users/x/bun.exe")).toBe(false);
});

test("isCompiledRuntime：無 ELEGENT_COMPILED 時，execPath 以 \\bun.exe 結尾視為開發模式", () => {
  expect(isCompiledRuntime("C:\\Users\\x\\bun.exe")).toBe(false);
});

test("isCompiledRuntime：無 ELEGENT_COMPILED 時，其餘 execPath 一律視為 compiled（fallback）", () => {
  expect(isCompiledRuntime("/usr/local/bin/elgt")).toBe(true);
});

test("isCompiledRuntime：無參數時預設用 process.execPath", () => {
  expect(isCompiledRuntime()).toBe(isCompiledRuntime(process.execPath));
});

test("isCompiledRuntime：ELEGENT_COMPILED=1 時無論 execPath 為何一律回 true（主要依據優先於後綴 fallback）", () => {
  process.env.ELEGENT_COMPILED = "1";
  expect(isCompiledRuntime("/usr/local/bin/bun")).toBe(true);
  expect(isCompiledRuntime("/usr/local/bin/bun.exe")).toBe(true);
});

test("isCompiledRuntime：ELEGENT_COMPILED 為非 \"1\" 的值時退回後綴 fallback", () => {
  process.env.ELEGENT_COMPILED = "0";
  expect(isCompiledRuntime("/usr/local/bin/bun")).toBe(false);
  expect(isCompiledRuntime("/usr/local/bin/elgt")).toBe(true);
});
