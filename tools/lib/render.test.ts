import { expect, test } from "bun:test";
import { renderTranscript } from "./render";

const jsonl = await Bun.file(new URL("../fixtures/session.jsonl", import.meta.url)).text();

test("逐字保存對話、剝除雜訊、工具壓縮", () => {
  const r = renderTranscript(jsonl, "sess-1");
  expect(r.markdown).toContain("幫我看看 README");
  expect(r.markdown).not.toContain("注入內容");
  expect(r.markdown).toContain("> 🔧 Read(");
  expect(r.markdown).toContain("README 有三行。");
});

test("tool_result-only 不成為獨立 user 回合", () => {
  const r = renderTranscript(jsonl, "sess-1");
  const userTurns = r.markdown.match(/^### User/gm) ?? [];
  expect(userTurns.length).toBe(1);
});

test("metadata 正確", () => {
  const r = renderTranscript(jsonl, "sess-1");
  expect(r.date).toBe("2026-07-06");
  expect(r.projectSlug).toBe("llm-wiki");
  expect(r.title).toContain("幫我看看 README");
});
