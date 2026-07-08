import { expect, test } from "bun:test";
import { buildSessionStartOutput } from "./sessionstart";
import { WAKE_MAX_CHARS } from "@core/wake";

function bundleOf(text: string) {
  return { text, chars: text.length, withinBudget: text.length <= WAKE_MAX_CHARS };
}

test("正常 bundle 輸出 additionalContext 並以 <memory-wake> 包裹", () => {
  const out: any = buildSessionStartOutput(bundleOf("我是記憶系統"));
  const ctx = out.hookSpecificOutput.additionalContext as string;
  expect(out.hookSpecificOutput.hookEventName).toBe("SessionStart");
  expect(ctx).toContain("我是記憶系統");
  expect(ctx.startsWith("<memory-wake>\n")).toBe(true);
  expect(ctx.endsWith("\n</memory-wake>")).toBe(true);
});

test("4000 字元 bundle 最終 additionalContext 不超過硬預算", () => {
  const out: any = buildSessionStartOutput(bundleOf("x".repeat(4000)));
  const ctx = out.hookSpecificOutput.additionalContext as string;
  expect(ctx.length).toBeLessThanOrEqual(WAKE_MAX_CHARS);
  expect(ctx.startsWith("<memory-wake>\n")).toBe(true);
  expect(ctx.endsWith("\n</memory-wake>")).toBe(true);
});

test("空 bundle 輸出 {}", () => {
  expect(buildSessionStartOutput(bundleOf(""))).toEqual({});
});
