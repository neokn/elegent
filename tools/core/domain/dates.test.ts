import { expect, test } from "bun:test";
import { localDateISO } from "@core/domain/dates";

test("回傳本地時區的 YYYY-MM-DD、月與日補零", () => {
  const d = new Date(2026, 0, 5); // 本地時間 2026-01-05
  expect(localDateISO(d)).toBe("2026-01-05");
});

test("本地時間深夜仍取本地日期，不會被誤轉成 UTC 的前一天", () => {
  // 本地時間 2026-07-06 23:59:59；若誤用 toISOString().slice(0,10)（UTC）
  // 在 UTC 之後的時區（例如 UTC+8）會被錯轉成前一天。
  const d = new Date(2026, 6, 6, 23, 59, 59);
  expect(localDateISO(d)).toBe("2026-07-06");
});

test("不帶參數時使用當下時間", () => {
  const s = localDateISO();
  expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
