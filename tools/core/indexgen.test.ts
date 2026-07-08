import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { regenerateIndexes } from "./indexgen";
import { nodeFileStore } from "@infrastructure/adapters/node-fs";

test("生成兩層 index，description 上提，root 保留 okf_version", () => {
  const root = mkdtempSync(join(tmpdir(), "idx-"));
  mkdirSync(join(root, "projects/demo"), { recursive: true });
  writeFileSync(join(root, "projects/demo/note-a.md"), `---\ntype: note\ntitle: Note A\ndescription: 測試筆記\n---\n\nbody\n`);
  writeFileSync(join(root, "index.md"), `---\nokf_version: "0.1"\n---\n\n# 舊內容\n`);

  const written = regenerateIndexes(nodeFileStore, root);
  expect(written.length).toBeGreaterThanOrEqual(3); // root、projects、projects/demo

  const demo = readFileSync(join(root, "projects/demo/index.md"), "utf8");
  expect(demo).toContain("* [Note A](note-a.md) - 測試筆記");
  expect(demo.startsWith("---")).toBe(false); // 子目錄 index 無 frontmatter

  const rootIdx = readFileSync(join(root, "index.md"), "utf8");
  expect(rootIdx).toContain("okf_version");
  expect(rootIdx).toContain("* [projects](projects/index.md)");
});
