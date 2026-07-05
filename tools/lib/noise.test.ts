import { expect, test } from "bun:test";
import { stripNoise } from "./noise";

test("移除行首的注入標籤區塊", () => {
  const input = "正文一\n<system-reminder>\n內部提醒\n</system-reminder>\n正文二\n";
  const out = stripNoise(input);
  expect(out).toContain("正文一");
  expect(out).toContain("正文二");
  expect(out).not.toContain("內部提醒");
});

test("單行標籤與 command 標籤", () => {
  const input = "<command-name>/digest</command-name>\n<command-message>digest</command-message>\n嗨\n";
  expect(stripNoise(input).trim()).toBe("嗨");
});

test("散文中提到標籤不受影響", () => {
  const input = "我在討論 <system-reminder> 這個字串\n";
  expect(stripNoise(input)).toBe(input);
});
