import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSessionEndHook } from "./sessionend";

const CLI = new URL("./sessionend.ts", import.meta.url).pathname;

test("歸檔並清除 session 游標", () => {
  const archived: string[] = [];
  let cleared = false;
  const out = runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    {
      archive: (t) => { archived.push(t); return true; },
      clear: () => { cleared = true; },
      log: () => {},
    },
  );
  expect(out).toEqual({});
  expect(archived.length).toBe(1);
  expect(cleared).toBe(true);
});

test("歸檔失敗仍清游標且回 {}", () => {
  let cleared = false;
  const out = runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    { archive: () => { throw new Error("x"); }, clear: () => { cleared = true; }, log: () => {} },
  );
  expect(out).toEqual({});
  expect(cleared).toBe(true);
});

test("archive 成功後呼叫 onArchived", () => {
  let archivedOk = false;
  runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    { archive: () => true, clear: () => {}, log: () => {}, onArchived: () => { archivedOk = true; } },
  );
  expect(archivedOk).toBe(true);
});

test("archive throw 時 onArchived 不被呼叫", () => {
  let archivedOk = false;
  runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    {
      archive: () => { throw new Error("x"); },
      clear: () => {},
      log: () => {},
      onArchived: () => { archivedOk = true; },
    },
  );
  expect(archivedOk).toBe(false);
});

test("無 transcript_path 時 onArchived 不被呼叫", () => {
  let archivedOk = false;
  runSessionEndHook(
    { session_id: "s1" },
    { archive: () => true, clear: () => {}, log: () => {}, onArchived: () => { archivedOk = true; } },
  );
  expect(archivedOk).toBe(false);
});

test("archive 成功後呼叫 reindex", () => {
  let reindexed = 0;
  runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    { archive: () => true, clear: () => {}, log: () => {}, reindex: () => { reindexed++; } },
  );
  expect(reindexed).toBe(1);
});

test("archive throw 時 reindex 不被呼叫", () => {
  let reindexed = 0;
  runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    { archive: () => { throw new Error("x"); }, clear: () => {}, log: () => {}, reindex: () => { reindexed++; } },
  );
  expect(reindexed).toBe(0);
});

test("無 transcript_path 時 reindex 不被呼叫", () => {
  let reindexed = 0;
  runSessionEndHook(
    { session_id: "s1" },
    { archive: () => true, clear: () => {}, log: () => {}, reindex: () => { reindexed++; } },
  );
  expect(reindexed).toBe(0);
});

test("archive 回傳 written:false（空 transcript 沒寫檔）時，onArchived 與 reindex 都不觸發", () => {
  let archivedOk = false;
  let reindexed = 0;
  const out = runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    {
      archive: () => false, // 對齊 archiveClaudeTranscript 的 written:false（空 transcript 未寫檔）
      clear: () => {},
      log: () => {},
      onArchived: () => { archivedOk = true; },
      reindex: () => { reindexed++; },
    },
  );
  expect(out).toEqual({});
  expect(archivedOk).toBe(false);
  expect(reindexed).toBe(0);
});

test("ELEGENT_HEADLESS_DIGEST=1 時（子程序自我參照防護）：直接 emit {}，不歸檔", () => {
  const repo = mkdtempSync(join(tmpdir(), "sessionend-cli-"));
  mkdirSync(join(repo, "vault"), { recursive: true });
  const transcript = join(repo, "fake.jsonl");
  writeFileSync(
    transcript,
    JSON.stringify({ type: "user", timestamp: "2026-07-06T10:00:00Z", message: { role: "user", content: "hello" } }) + "\n",
  );
  const input = JSON.stringify({ session_id: "headless-s1", transcript_path: transcript });

  const p = Bun.spawnSync(["bun", CLI], {
    cwd: repo,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo, ELEGENT_HEADLESS_DIGEST: "1" },
    stdin: new TextEncoder().encode(input),
  });

  expect(p.stdout.toString().trim()).toBe("{}");
  expect(existsSync(join(repo, "vault/palace/raw/conversations"))).toBe(false);
});

test("reindex 拋錯不擋：仍清游標且回 {}", () => {
  let cleared = false;
  const logged: string[] = [];
  const out = runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    {
      archive: () => true,
      clear: () => { cleared = true; },
      log: (h) => { logged.push(h); },
      reindex: () => { throw new Error("reindex boom"); },
    },
  );
  expect(out).toEqual({});
  expect(cleared).toBe(true);
  expect(logged).toContain("sessionend:reindex");
});
