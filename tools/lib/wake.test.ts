import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWakeBundle, WAKE_MAX_CHARS } from "./wake";

function vaultWith(identity: string, story: string): string {
  const root = mkdtempSync(join(tmpdir(), "wake-"));
  mkdirSync(join(root, "palace/wake"), { recursive: true });
  writeFileSync(join(root, "palace/wake/identity.md"), `---\ntype: wake\n---\n\n${identity}`);
  writeFileSync(join(root, "palace/wake/essential-story.md"), `---\ntype: wake\n---\n\n${story}`);
  return root;
}

test("串接兩檔 body、不含 frontmatter", () => {
  const root = vaultWith("我是 Justin 的記憶系統", "本週焦點：memory system");
  const b = buildWakeBundle(root);
  expect(b.text).toContain("我是 Justin 的記憶系統");
  expect(b.text).toContain("本週焦點");
  expect(b.text).not.toContain("type: wake");
  expect(b.withinBudget).toBe(true);
});

test("超預算標記", () => {
  const root = vaultWith("x".repeat(4000), "y");
  const b = buildWakeBundle(root);
  expect(b.chars).toBeGreaterThan(WAKE_MAX_CHARS);
  expect(b.withinBudget).toBe(false);
});

test("檔案缺失時空字串", () => {
  const root = mkdtempSync(join(tmpdir(), "wake-"));
  expect(buildWakeBundle(root).text).toBe("");
});
