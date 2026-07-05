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

test("tool_result 缺 content 不 crash", () => {
  const line = JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "tool_result" }] },
  });
  expect(() => renderTranscript(line, "sess-2")).not.toThrow();
});

test("title 取首則 user 文字前 60 字元（多行壓成單行）", () => {
  const line = JSON.stringify({
    type: "user",
    timestamp: "2026-07-06T10:00:00Z",
    message: { role: "user", content: "嗨\n請幫我修這個 bug" },
  });
  const r = renderTranscript(line, "sess-3");
  expect(r.title).toContain("請幫我修這個 bug");
});

test("tool_result 超過 40 行時截頭尾各 20 行", () => {
  const rows = Array.from({ length: 45 }, (_, i) => `row-${String(i + 1).padStart(2, "0")}`).join("\n");
  const line = JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "tool_result", content: rows }] },
  });
  const r = renderTranscript(line, "sess-4");
  expect(r.markdown).toContain("… (省略 5 行)");
  expect(r.markdown).toContain("row-01");
  expect(r.markdown).toContain("row-45");
  expect(r.markdown).not.toContain("row-21");
});
