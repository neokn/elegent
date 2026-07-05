import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backfill } from "./backfill";

function setup() {
  const projects = mkdtempSync(join(tmpdir(), "proj-"));
  mkdirSync(join(projects, "-Users-me-llm-wiki"), { recursive: true });
  cpSync(new URL("../fixtures/session.jsonl", import.meta.url).pathname, join(projects, "-Users-me-llm-wiki/sess-bf.jsonl"));
  return { projects, vault: mkdtempSync(join(tmpdir(), "vault-")) };
}

test("補檔未歸檔的 session，再跑一次全 skip", () => {
  const { projects, vault } = setup();
  const first = backfill(projects, vault);
  expect(first.archived.length).toBe(1);
  expect(first.skipped.length).toBe(0);
  const second = backfill(projects, vault);
  expect(second.archived.length).toBe(0);
  expect(second.skipped.length).toBe(1);
});

test("projectsDir 不存在回空結果不 throw", () => {
  const vault = mkdtempSync(join(tmpdir(), "vault-"));
  const r = backfill(join(tmpdir(), `nonexistent-${Date.now()}`), vault);
  expect(r.archived).toEqual([]);
  expect(r.skipped).toEqual([]);
  expect(r.failed).toEqual([]);
});

test("單一壞檔進 failed，好檔仍被歸檔", () => {
  const { projects, vault } = setup();
  const bad = join(projects, "-Users-me-llm-wiki", "sess-bad.jsonl");
  writeFileSync(bad, "unreadable");
  chmodSync(bad, 0o000);
  const r = backfill(projects, vault);
  expect(r.archived.length).toBe(1);
  expect(r.failed.length).toBe(1);
  expect(r.failed[0]).toBe(bad);
  expect(r.skipped.length).toBe(0);
});
