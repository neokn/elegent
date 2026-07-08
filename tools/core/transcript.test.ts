import { expect, test } from "bun:test";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeFileStore } from "@infrastructure/adapters/node-fs";
import { renderTurns, writeConversationArchive, type RenderedTranscript } from "./transcript";
import { parseNote } from "./frontmatter";

test("renderTurns：User/Assistant 交錯，空 turns 回空字串", () => {
  expect(renderTurns([])).toBe("");
  const md = renderTurns([
    { role: "user", parts: ["嗨"] },
    { role: "assistant", parts: ["你好", "在"] },
  ]);
  expect(md).toBe("### User\n\n嗨\n\n### Assistant\n\n你好\n\n在");
});

const rendered: RenderedTranscript = {
  markdown: "### User\n\nhi\n",
  sessionId: "s1",
  projectSlug: "demo",
  date: "2026-07-08",
  title: "hi",
};

test("writeConversationArchive：descriptor 決定 source/tags/description，空 markdown 不寫檔", () => {
  const vault = mkdtempSync(join(tmpdir(), "tvault-"));
  const { outPath, written } = writeConversationArchive(nodeFileStore, vault, rendered, "s1", {
    sourceScheme: "codex-session",
    extraTags: ["codex"],
    descriptionPrefix: "Codex 對話逐字紀錄：",
    projectWhenNull: false,
  });
  expect(written).toBe(true);
  expect(outPath).toContain("palace/raw/conversations/demo/2026-07-08_s1.md");
  const { frontmatter } = parseNote(readFileSync(outPath, "utf8"));
  expect(frontmatter?.source).toBe("codex-session:s1");
  expect(frontmatter?.tags).toContain("codex");
  expect(String(frontmatter?.description)).toContain("Codex 對話逐字紀錄：");

  const empty = writeConversationArchive(nodeFileStore, vault, { ...rendered, markdown: "  \n" }, "s1", {
    sourceScheme: "x",
    descriptionPrefix: "",
    projectWhenNull: false,
  });
  expect(empty.written).toBe(false);
  expect(empty.outPath).toBe("");
});

test("writeConversationArchive：projectSlug 為 null 時，projectWhenNull 決定是否填 unsorted", () => {
  const vault = mkdtempSync(join(tmpdir(), "tvault-"));
  const nulled: RenderedTranscript = { ...rendered, projectSlug: null };
  const claude = writeConversationArchive(nodeFileStore, vault, nulled, "s1", { sourceScheme: "claude-session", descriptionPrefix: "", projectWhenNull: true });
  expect(parseNote(readFileSync(claude.outPath, "utf8")).frontmatter?.project).toBe("unsorted");
  const codex = writeConversationArchive(nodeFileStore, vault, { ...nulled, sessionId: "s2" }, "s2", { sourceScheme: "codex-session", descriptionPrefix: "", projectWhenNull: false });
  expect(parseNote(readFileSync(codex.outPath, "utf8")).frontmatter?.project).toBeUndefined();
  expect(codex.outPath).toContain("/unsorted/");
});
