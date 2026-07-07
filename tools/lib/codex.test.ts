import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  archiveCodexTranscript,
  codexSessionIdsFromHookInput,
  codexTranscriptPathsFromHookInput,
  countCodexUserMessages,
  findCodexTranscriptForHook,
  findLatestCodexSessionFile,
  renderCodexTranscript,
} from "./codex";

const sample = [
  JSON.stringify({
    timestamp: "2026-07-07T13:17:54.923Z",
    type: "session_meta",
    payload: {
      session_id: "019f3cba-5f37-75d2-9b61-909b75673fde",
      cwd: "/Users/neokn/GitHub/neokn/elegent",
    },
  }),
  JSON.stringify({
    timestamp: "2026-07-07T13:18:00.000Z",
    type: "response_item",
    payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>skip</environment_context>" }] },
  }),
  JSON.stringify({
    timestamp: "2026-07-07T13:18:01.000Z",
    type: "event_msg",
    payload: { type: "user_message", message: "你有辦法使用這個 repo 嗎" },
  }),
  JSON.stringify({
    timestamp: "2026-07-07T13:18:02.000Z",
    type: "response_item",
    payload: { type: "function_call", name: "exec_command", arguments: "{\"cmd\":\"pwd\"}" },
  }),
  JSON.stringify({
    timestamp: "2026-07-07T13:18:03.000Z",
    type: "response_item",
    payload: { type: "function_call_output", output: "Output:\n/Users/neokn/GitHub/neokn/elegent" },
  }),
  JSON.stringify({
    timestamp: "2026-07-07T13:18:04.000Z",
    type: "event_msg",
    payload: { type: "agent_message", message: "可以。" },
  }),
].join("\n") + "\n";

test("renderCodexTranscript：保留 user/assistant 與工具摘要，跳過環境訊息", () => {
  const r = renderCodexTranscript(sample, "/tmp/rollout-019f3cba-5f37-75d2-9b61-909b75673fde.jsonl");
  expect(r.sessionId).toBe("019f3cba-5f37-75d2-9b61-909b75673fde");
  expect(r.projectSlug).toBe("elegent");
  expect(r.date).toBe("2026-07-07");
  expect(r.title).toContain("你有辦法使用");
  expect(r.markdown).toContain("### User");
  expect(r.markdown).toContain("### Assistant");
  expect(r.markdown).toContain("> Tool: exec_command");
  expect(r.markdown).toContain("> Result:");
  expect(r.markdown).not.toContain("environment_context");
});

test("countCodexUserMessages：優先計算 event_msg user_message", () => {
  expect(countCodexUserMessages(sample)).toBe(1);
});

test("archiveCodexTranscript：寫入 palace/raw/conversations/<project>", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-archive-"));
  const transcript = join(dir, "session.jsonl");
  const vault = join(dir, "vault");
  writeFileSync(transcript, sample);

  const r = archiveCodexTranscript(transcript, vault);
  expect(r.written).toBe(true);
  expect(r.outPath).toContain("vault/palace/raw/conversations/elegent");
  expect(existsSync(r.outPath)).toBe(true);
  const text = readFileSync(r.outPath, "utf8");
  expect(text).toContain("source: codex-session:019f3cba-5f37-75d2-9b61-909b75673fde");
  expect(text).toContain("tags:");
});

test("findLatestCodexSessionFile：依 cwd 找最新 Codex session", () => {
  const root = mkdtempSync(join(tmpdir(), "codex-sessions-"));
  const olderDir = join(root, "2026/07/06");
  const newerDir = join(root, "2026/07/07");
  mkdirSync(olderDir, { recursive: true });
  mkdirSync(newerDir, { recursive: true });
  const older = join(olderDir, "rollout-old.jsonl");
  const newer = join(newerDir, "rollout-new.jsonl");
  writeFileSync(older, sample.replace("019f3cba-5f37-75d2-9b61-909b75673fde", "old-session"));
  writeFileSync(newer, sample);
  utimesSync(older, new Date("2026-07-06T00:00:00Z"), new Date("2026-07-06T00:00:00Z"));
  utimesSync(newer, new Date("2026-07-07T00:00:00Z"), new Date("2026-07-07T00:00:00Z"));

  const found = findLatestCodexSessionFile({ cwd: "/Users/neokn/GitHub/neokn/elegent", sessionsRoot: root });
  expect(found?.path).toBe(newer);
});

test("findCodexTranscriptForHook：優先使用 hook payload 內的 transcript 路徑", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-hook-input-"));
  const transcript = join(dir, "session.jsonl");
  writeFileSync(transcript, sample);
  const found = findCodexTranscriptForHook({ transcript_path: transcript }, "/elsewhere", dir);
  expect(found?.path).toBe(transcript);
  expect(codexTranscriptPathsFromHookInput({ nested: { transcriptPath: transcript } })).toEqual([transcript]);
  expect(codexSessionIdsFromHookInput({ nested: { sessionId: "abc" } })).toEqual(["abc"]);
});
