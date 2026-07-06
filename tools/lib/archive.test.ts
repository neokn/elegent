import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveTranscript } from "./archive";
import { renderTranscript } from "./render";
import { parseNote } from "./frontmatter";
import { localDateISO } from "./dates";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "arch-"));
  const t = join(dir, "sess-1.jsonl");
  cpSync(new URL("../fixtures/session.jsonl", import.meta.url).pathname, t);
  return { vault: mkdtempSync(join(tmpdir(), "vault-")), t };
}

test("歸檔到正確路徑且 frontmatter 合規", () => {
  const { vault, t } = setup();
  const { outPath, written } = archiveTranscript(t, vault, "sess-1");
  expect(written).toBe(true);
  expect(outPath).toContain("palace/raw/conversations/llm-wiki/2026-07-06_sess-1.md");
  const { frontmatter, body } = parseNote(readFileSync(outPath, "utf8"));
  expect(frontmatter?.type).toBe("raw-log");
  expect(frontmatter?.source).toBe("claude-session:sess-1");
  expect(body).toContain("幫我看看 README");
});

test("冪等覆寫", () => {
  const { vault, t } = setup();
  archiveTranscript(t, vault, "sess-1");
  const { written } = archiveTranscript(t, vault, "sess-1");
  expect(written).toBe(true); // 覆寫同一檔，不產生第二個檔
});

test("非法 sessionId 拒絕", () => {
  const { vault, t } = setup();
  expect(() => archiveTranscript(t, vault, "../evil")).toThrow();
});

test("傳入預先 render 的結果就不重 render，date 以傳入為準", () => {
  const { vault, t } = setup();
  const rendered = renderTranscript(readFileSync(t, "utf8"), "sess-1");
  rendered.date = "1999-01-01";
  const { outPath, written } = archiveTranscript(t, vault, "sess-1", rendered);
  expect(written).toBe(true);
  expect(outPath).toContain("palace/raw/conversations/llm-wiki/1999-01-01_sess-1.md");
  const { frontmatter } = parseNote(readFileSync(outPath, "utf8"));
  expect(frontmatter?.date).toBe("1999-01-01");
});

test("render body 全空白（trim 後空）時不寫檔，回 { outPath: '', written: false }", () => {
  const { vault, t } = setup();
  const rendered = renderTranscript(readFileSync(t, "utf8"), "sess-1");
  rendered.markdown = "   \n\t  \n";
  const { outPath, written } = archiveTranscript(t, vault, "sess-1", rendered);
  expect(written).toBe(false);
  expect(outPath).toBe("");
  expect(existsSync(join(vault, "palace/raw/conversations"))).toBe(false);
});

test("傳入的 rendered.date 格式不合法時，改用本地今日且路徑不逃逸出 conversations 目錄", () => {
  const { vault, t } = setup();
  const rendered = renderTranscript(readFileSync(t, "utf8"), "sess-1");
  rendered.date = "../evil";
  const { outPath } = archiveTranscript(t, vault, "sess-1", rendered);
  const conversationsDir = join(vault, "palace/raw/conversations");
  expect(outPath.startsWith(conversationsDir + "/")).toBe(true);
  const filename = outPath.split("/").at(-1)!;
  expect(filename).toBe(`${localDateISO()}_sess-1.md`);
  const { frontmatter } = parseNote(readFileSync(outPath, "utf8"));
  expect(frontmatter?.date).toBe(localDateISO());
});
