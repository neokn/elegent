import { expect, test } from "bun:test";
import { checkAugmentation } from "./guard";

const before = `---\ntype: entity\nuser_managed: false\n---\n\n## Facts\n\nx\n\n## Citations\n\n* [a](a.md)\n* [b](b.md)\n`;

test("合法擴充通過", () => {
  const after = before + "\n## Links\n\n* [c](c.md)\n";
  expect(checkAugmentation(before, after)).toEqual([]);
});

test("heading 消失被擋", () => {
  const after = `---\ntype: entity\nuser_managed: false\n---\n\n## Citations\n\n* [a](a.md)\n* [b](b.md)\n`;
  expect(checkAugmentation(before, after).some((v) => v.includes("Facts"))).toBe(true);
});

test("citations 減少被擋", () => {
  const after = before.replace("* [b](b.md)\n", "");
  expect(checkAugmentation(before, after).some((v) => v.includes("Citations"))).toBe(true);
});

test("user_managed 檔任何變動被擋", () => {
  const pinned = before.replace("user_managed: false", "user_managed: true");
  expect(checkAugmentation(pinned, pinned)).toEqual([]);
  expect(checkAugmentation(pinned, pinned + "多一行\n").length).toBe(1);
});
