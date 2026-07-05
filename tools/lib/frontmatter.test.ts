import { expect, test } from "bun:test";
import { parseNote, serializeNote, validateFrontmatter, NOTE_TYPES } from "./frontmatter";

const doc = `---\ntype: entity\ntitle: 測試\ntags:\n  - person\n---\n\n# 內文\n`;

test("parseNote 拆出 frontmatter 與 body", () => {
  const { frontmatter, body } = parseNote(doc);
  expect(frontmatter?.type).toBe("entity");
  expect(body).toContain("# 內文");
});

test("parseNote 無 frontmatter 回 null", () => {
  expect(parseNote("# 純內文\n").frontmatter).toBeNull();
});

test("serializeNote 鍵序固定且可 round-trip", () => {
  const out = serializeNote({ tags: ["a"], type: "note", title: "T" }, "body\n");
  expect(out.indexOf("type:")).toBeLessThan(out.indexOf("title:"));
  expect(parseNote(out).frontmatter?.title).toBe("T");
});

test("validateFrontmatter 擋缺 type 與非法 type", () => {
  expect(validateFrontmatter(null)).not.toEqual([]);
  expect(validateFrontmatter({ type: "banana" })).not.toEqual([]);
  expect(validateFrontmatter({ type: "note" })).toEqual([]);
  expect(NOTE_TYPES).toContain("raw-log");
});
