import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveTranscript } from "./archive";
import { parseNote } from "./frontmatter";

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
