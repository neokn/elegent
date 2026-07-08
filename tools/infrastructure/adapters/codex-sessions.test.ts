import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeCodexSessionLocator } from "./codex-sessions";

const meta = (sid: string, cwd: string): string =>
  JSON.stringify({ type: "session_meta", payload: { session_id: sid, cwd } }) + "\n";

function withCodexHome<T>(home: string, fn: () => T): T {
  const prev = process.env.CODEX_HOME;
  process.env.CODEX_HOME = home;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = prev;
  }
}

test("locate：依 cwd 掃 $CODEX_HOME/sessions 找最新 rollout", () => {
  const home = mkdtempSync(join(tmpdir(), "codex-home-"));
  mkdirSync(join(home, "sessions/2026/07/06"), { recursive: true });
  mkdirSync(join(home, "sessions/2026/07/07"), { recursive: true });
  const older = join(home, "sessions/2026/07/06/rollout-old.jsonl");
  const newer = join(home, "sessions/2026/07/07/rollout-new.jsonl");
  writeFileSync(older, meta("old", "/repo"));
  writeFileSync(newer, meta("new", "/repo"));
  utimesSync(older, new Date("2026-07-06T00:00:00Z"), new Date("2026-07-06T00:00:00Z"));
  utimesSync(newer, new Date("2026-07-07T00:00:00Z"), new Date("2026-07-07T00:00:00Z"));

  const found = withCodexHome(home, () => nodeCodexSessionLocator.locate({}, "/repo"));
  expect(found?.path).toBe(newer);
  expect(found?.sessionId).toBe("new");
});

test("locate：hook 輸入明講 transcript 路徑時優先使用（存在才算）", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-explicit-"));
  const transcript = join(dir, "session.jsonl");
  writeFileSync(transcript, meta("s1", "/x"));
  const found = nodeCodexSessionLocator.locate({ transcript_path: transcript }, "/elsewhere");
  expect(found?.path).toBe(transcript);
});

test("locate：依 session id 匹配（不論 cwd）", () => {
  const home = mkdtempSync(join(tmpdir(), "codex-home-sid-"));
  mkdirSync(join(home, "sessions"), { recursive: true });
  const f = join(home, "sessions/rollout-x.jsonl");
  writeFileSync(f, meta("target-sid", "/somewhere-else"));
  const found = withCodexHome(home, () => nodeCodexSessionLocator.locate({ session_id: "target-sid" }, "/unrelated"));
  expect(found?.path).toBe(f);
});

test("locate：sessions 目錄不存在時回 null", () => {
  const empty = mkdtempSync(join(tmpdir(), "codex-empty-"));
  expect(withCodexHome(empty, () => nodeCodexSessionLocator.locate({}, "/nope"))).toBeNull();
});
