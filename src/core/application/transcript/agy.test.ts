import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeFileStore } from "@infrastructure/adapters/node-fs";
import {
  archiveAgyTranscript,
  countAgyUserMessages,
  deriveAgyProjectSlug,
  renderAgyTranscript,
} from "./agy";
import { parseNote } from "@core/domain/frontmatter";
import { localDateISO } from "@core/domain/dates";

test("agy 逐字稿轉換與雜訊剝除", () => {
  const jsonl = [
    JSON.stringify({
      step_index: 0,
      source: "USER_EXPLICIT",
      type: "USER_INPUT",
      created_at: "2026-07-08T10:00:00Z",
      content: "幫我看看 README",
    }),
    JSON.stringify({
      step_index: 1,
      source: "MODEL",
      type: "PLANNER_RESPONSE",
      created_at: "2026-07-08T10:00:01Z",
      content: "好的，我來幫你看看。",
      tool_calls: [{ name: "view_file", args: { AbsolutePath: "/path/to/README.md" } }],
    }),
    JSON.stringify({
      step_index: 2,
      source: "MODEL",
      type: "VIEW_FILE",
      created_at: "2026-07-08T10:00:02Z",
      content: "README has some contents.",
    }),
  ].join("\n");

  const r = renderAgyTranscript(jsonl, "sess-agy-1");
  expect(r.markdown).toContain("幫我看看 README");
  expect(r.markdown).toContain("好的，我來幫你看看。");
  expect(r.markdown).toContain("> 🔧 view_file(");
  expect(r.markdown).toContain("> 📥 result:");
  expect(r.markdown).toContain("README has some contents.");
  expect(r.date).toBe("2026-07-08");
  expect(r.title).toBe("幫我看看 README");
});

test("deriveAgyProjectSlug 從 workspacePaths 推導 slug", () => {
  const jsonl = JSON.stringify({
    step_index: 0,
    workspacePaths: ["/Users/neokn/GitHub/neokn/elegent"],
  });
  expect(deriveAgyProjectSlug(jsonl)).toBe("elegent");
});

test("countAgyUserMessages 計數正確", () => {
  const jsonl = [
    JSON.stringify({ source: "USER_EXPLICIT", type: "USER_INPUT", content: "hello" }),
    JSON.stringify({ source: "MODEL", type: "PLANNER_RESPONSE", content: "hi" }),
    JSON.stringify({ source: "USER_EXPLICIT", type: "USER_INPUT", content: "world" }),
  ].join("\n");
  expect(countAgyUserMessages(jsonl)).toBe(2);
});

test("archiveAgyTranscript 歸檔功能正常", () => {
  const jsonl = [
    JSON.stringify({
      step_index: 0,
      source: "USER_EXPLICIT",
      type: "USER_INPUT",
      created_at: "2026-07-08T10:00:00Z",
      content: "測試",
      workspacePaths: ["/Users/neokn/GitHub/neokn/elegent"],
    }),
  ].join("\n");

  const tmp = mkdtempSync(join(tmpdir(), "elgt-agy-test-"));
  const transcriptPath = join(tmp, "sess.jsonl");
  const vaultPath = join(tmp, "vault");

  nodeFileStore.write(transcriptPath, jsonl);

  const res = archiveAgyTranscript(nodeFileStore, transcriptPath, vaultPath, "sess-agy-2");
  expect(res.written).toBe(true);
  expect(existsSync(res.outPath)).toBe(true);

  const note = parseNote(nodeFileStore.read(res.outPath));
  expect(note.frontmatter?.type).toBe("raw-log");
  expect(note.frontmatter?.source).toBe("agy-session:sess-agy-2");
});
