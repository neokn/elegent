import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeFileStore } from "@infrastructure/adapters/node-fs";
import {
  archiveClaudeTranscript,
  countClaudeUserMessages,
  deriveClaudeProjectSlug,
  renderClaudeTranscript,
} from "./claude";
import { parseNote } from "@core/domain/frontmatter";
import { localDateISO } from "@core/domain/dates";

const jsonl = await Bun.file(new URL("../../../fixtures/session.jsonl", import.meta.url)).text();

// --- renderClaudeTranscript（原 render.ts） ---

test("逐字保存對話、剝除雜訊、工具壓縮", () => {
  const r = renderClaudeTranscript(jsonl, "sess-1");
  expect(r.markdown).toContain("幫我看看 README");
  expect(r.markdown).not.toContain("注入內容");
  expect(r.markdown).toContain("> 🔧 Read(");
  expect(r.markdown).toContain("README 有三行。");
});

test("tool_result-only 不成為獨立 user 回合", () => {
  const r = renderClaudeTranscript(jsonl, "sess-1");
  const userTurns = r.markdown.match(/^### User/gm) ?? [];
  expect(userTurns.length).toBe(1);
});

test("metadata 正確", () => {
  const r = renderClaudeTranscript(jsonl, "sess-1");
  expect(r.date).toBe("2026-07-06");
  expect(r.projectSlug).toBe("llm-wiki");
  expect(r.title).toContain("幫我看看 README");
});

test("tool_result 缺 content 不 crash", () => {
  const line = JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "tool_result" }] },
  });
  expect(() => renderClaudeTranscript(line, "sess-2")).not.toThrow();
});

test("title 取首則 user 文字前 60 字元（多行壓成單行）", () => {
  const line = JSON.stringify({
    type: "user",
    timestamp: "2026-07-06T10:00:00Z",
    message: { role: "user", content: "嗨\n請幫我修這個 bug" },
  });
  const r = renderClaudeTranscript(line, "sess-3");
  expect(r.title).toContain("請幫我修這個 bug");
});

test("tool_result 超過 40 行時截頭尾各 20 行", () => {
  const rows = Array.from({ length: 45 }, (_, i) => `row-${String(i + 1).padStart(2, "0")}`).join("\n");
  const line = JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "tool_result", content: rows }] },
  });
  const r = renderClaudeTranscript(line, "sess-4");
  expect(r.markdown).toContain("… (省略 5 行)");
  expect(r.markdown).toContain("row-01");
  expect(r.markdown).toContain("row-45");
  expect(r.markdown).not.toContain("row-21");
});

// --- countClaudeUserMessages（原 state.ts#countUserMessages） ---

test("countClaudeUserMessages 跳過 tool_result 與 slash command", () => {
  const j = [
    JSON.stringify({ type: "user", message: { content: "正常訊息" } }),
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "x" }] } }),
    JSON.stringify({ type: "user", message: { content: "<command-message>distil</command-message>" } }),
    JSON.stringify({ type: "assistant", message: { content: "回應" } }),
  ].join("\n");
  expect(countClaudeUserMessages(j)).toBe(1);
});

// --- deriveClaudeProjectSlug（原 safety.ts#deriveProjectSlug） ---

test("deriveClaudeProjectSlug 讀第一個 cwd", () => {
  const j = [
    JSON.stringify({ type: "user", cwd: "" }),
    JSON.stringify({ type: "user", cwd: "/Users/me/GitHub/neokn/llm-wiki" }),
  ].join("\n");
  expect(deriveClaudeProjectSlug(j)).toBe("llm-wiki");
  expect(deriveClaudeProjectSlug("not json")).toBeNull();
});

// --- archiveClaudeTranscript（原 archive.ts） ---

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "arch-"));
  const t = join(dir, "sess-1.jsonl");
  cpSync(new URL("../../../fixtures/session.jsonl", import.meta.url).pathname, t);
  return { vault: mkdtempSync(join(tmpdir(), "vault-")), t };
}

test("歸檔到正確路徑且 frontmatter 合規", () => {
  const { vault, t } = setup();
  const { outPath, written } = archiveClaudeTranscript(nodeFileStore, t, vault, "sess-1");
  expect(written).toBe(true);
  expect(outPath).toContain("pensieve/ankipan/conversations/llm-wiki/2026-07-06_sess-1.md");
  const { frontmatter, body } = parseNote(readFileSync(outPath, "utf8"));
  expect(frontmatter?.type).toBe("raw-log");
  expect(frontmatter?.source).toBe("claude-session:sess-1");
  expect(body).toContain("幫我看看 README");
});

test("冪等覆寫", () => {
  const { vault, t } = setup();
  archiveClaudeTranscript(nodeFileStore, t, vault, "sess-1");
  const { written } = archiveClaudeTranscript(nodeFileStore, t, vault, "sess-1");
  expect(written).toBe(true); // 覆寫同一檔，不產生第二個檔
});

test("非法 sessionId 拒絕", () => {
  const { vault, t } = setup();
  expect(() => archiveClaudeTranscript(nodeFileStore, t, vault, "../evil")).toThrow();
});

test("傳入預先 render 的結果就不重 render，date 以傳入為準", () => {
  const { vault, t } = setup();
  const rendered = renderClaudeTranscript(readFileSync(t, "utf8"), "sess-1");
  rendered.date = "1999-01-01";
  const { outPath, written } = archiveClaudeTranscript(nodeFileStore, t, vault, "sess-1", rendered);
  expect(written).toBe(true);
  expect(outPath).toContain("pensieve/ankipan/conversations/llm-wiki/1999-01-01_sess-1.md");
  const { frontmatter } = parseNote(readFileSync(outPath, "utf8"));
  expect(frontmatter?.date).toBe("1999-01-01");
});

test("render body 全空白（trim 後空）時不寫檔，回 { outPath: '', written: false }", () => {
  const { vault, t } = setup();
  const rendered = renderClaudeTranscript(readFileSync(t, "utf8"), "sess-1");
  rendered.markdown = "   \n\t  \n";
  const { outPath, written } = archiveClaudeTranscript(nodeFileStore, t, vault, "sess-1", rendered);
  expect(written).toBe(false);
  expect(outPath).toBe("");
  expect(existsSync(join(vault, "pensieve/ankipan/conversations"))).toBe(false);
});

test("傳入的 rendered.date 格式不合法時，改用本地今日且路徑不逃逸出 conversations 目錄", () => {
  const { vault, t } = setup();
  const rendered = renderClaudeTranscript(readFileSync(t, "utf8"), "sess-1");
  rendered.date = "../evil";
  const { outPath } = archiveClaudeTranscript(nodeFileStore, t, vault, "sess-1", rendered);
  const conversationsDir = join(vault, "pensieve/ankipan/conversations");
  expect(outPath.startsWith(conversationsDir + "/")).toBe(true);
  const filename = outPath.split("/").at(-1)!;
  expect(filename).toBe(`${localDateISO()}_sess-1.md`);
  const { frontmatter } = parseNote(readFileSync(outPath, "utf8"));
  expect(frontmatter?.date).toBe(localDateISO());
});
