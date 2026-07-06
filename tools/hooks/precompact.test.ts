import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPreCompactHook } from "./precompact";

const CLI = new URL("./precompact.ts", import.meta.url).pathname;

test("無條件歸檔", () => {
  const archived: string[] = [];
  const out = runPreCompactHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    {
      countUser: () => 2, // 遠低於節流門檻仍要歸檔
      readLast: () => 0,
      writeLast: () => {},
      archive: (t) => { archived.push(t); },
      readTranscript: () => "",
      log: () => {},
    },
  );
  expect(out).toEqual({});
  expect(archived.length).toBe(1);
});

test("PALACE_HEADLESS_DIGEST=1 時（子程序自我參照防護）：直接 emit {}，不歸檔", () => {
  const repo = mkdtempSync(join(tmpdir(), "precompact-cli-"));
  mkdirSync(join(repo, "vault"), { recursive: true });
  const transcript = join(repo, "fake.jsonl");
  writeFileSync(
    transcript,
    JSON.stringify({ type: "user", timestamp: "2026-07-06T10:00:00Z", message: { role: "user", content: "hello" } }) + "\n",
  );
  const input = JSON.stringify({ session_id: "headless-s1", transcript_path: transcript });

  const p = Bun.spawnSync(["bun", CLI], {
    cwd: repo,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo, PALACE_HEADLESS_DIGEST: "1" },
    stdin: new TextEncoder().encode(input),
  });

  expect(p.stdout.toString().trim()).toBe("{}");
  expect(existsSync(join(repo, "vault/palace/raw/conversations"))).toBe(false);
});

test("錯誤時回 {} 不 throw", () => {
  const out = runPreCompactHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    { countUser: () => 0, readLast: () => 0, writeLast: () => {}, archive: () => { throw new Error("x"); }, readTranscript: () => "", log: () => {} },
  );
  expect(out).toEqual({});
});
