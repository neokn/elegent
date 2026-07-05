import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, cpSync } from "node:fs";
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
