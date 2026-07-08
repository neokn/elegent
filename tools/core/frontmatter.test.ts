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

test("validateFrontmatter 擋非字串 tag（未加引號的數字）", () => {
  expect(validateFrontmatter({ type: "note", tags: [2024] })).not.toEqual([]);
  expect(validateFrontmatter({ type: "note", tags: ["a", 2024] })).not.toEqual([]);
  expect(validateFrontmatter({ type: "note", tags: ["person", "ai"] })).toEqual([]);
});

test("parseNote malformed YAML 回 frontmatter null", () => {
  const { frontmatter, body } = parseNote("---\n: :\n---\n\nbody\n");
  expect(frontmatter).toBeNull();
  expect(body).toContain("body");
});

test("parseNote YAML 頂層是 list 回 frontmatter null", () => {
  expect(parseNote("---\n- a\n- b\n---\n\nbody\n").frontmatter).toBeNull();
});
