import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeFileStore } from "@infrastructure/adapters/node-fs";
import {
  archiveCodexTranscript,
  codexSessionIdsFromHookInput,
  codexTranscriptPathCandidatesFromHookInput,
  countCodexUserMessages,
  parseCodexSessionMeta,
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

test("archiveCodexTranscript：寫入 pensieve/ankipan/conversations/<project>", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-archive-"));
  const transcript = join(dir, "session.jsonl");
  const vault = join(dir, "vault");
  writeFileSync(transcript, sample);

  const r = archiveCodexTranscript(nodeFileStore, transcript, vault);
  expect(r.written).toBe(true);
  expect(r.outPath).toContain("vault/pensieve/ankipan/conversations/elegent");
  expect(existsSync(r.outPath)).toBe(true);
  const text = readFileSync(r.outPath, "utf8");
  expect(text).toContain("source: codex-session:019f3cba-5f37-75d2-9b61-909b75673fde");
  expect(text).toContain("tags:");
});

// session 探測（掃 ~/.codex/sessions）已移到 infrastructure/adapters/codex-sessions；
// 這裡只測留在 core 的純解析器。

test("codexTranscriptPathCandidatesFromHookInput：抽出 .jsonl 路徑候選（純：不檢查存在）", () => {
  const abs = "/tmp/foo/session.jsonl";
  expect(codexTranscriptPathCandidatesFromHookInput({ nested: { transcriptPath: abs } })).toEqual([abs]);
  expect(codexTranscriptPathCandidatesFromHookInput({ transcript_path: "/tmp/not-jsonl.txt" })).toEqual([]);
});

test("codexSessionIdsFromHookInput：遞迴抽出各種 session id key", () => {
  expect(codexSessionIdsFromHookInput({ nested: { sessionId: "abc" } })).toEqual(["abc"]);
  expect(codexSessionIdsFromHookInput({ thread_id: "t1", conversationId: "c1" }).sort()).toEqual(["c1", "t1"]);
});

test("parseCodexSessionMeta：解析第一行 session_meta 的 session_id/cwd", () => {
  const first = JSON.stringify({ type: "session_meta", payload: { session_id: "s1", cwd: "/x" } });
  expect(parseCodexSessionMeta(first)).toEqual({ sessionId: "s1", cwd: "/x" });
  expect(parseCodexSessionMeta("not json")).toEqual({ sessionId: null, cwd: null });
});
