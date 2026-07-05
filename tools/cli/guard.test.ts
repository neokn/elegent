import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = new URL("./guard.ts", import.meta.url).pathname;

function run(cmd: string[], cwd: string) {
  const p = Bun.spawnSync(cmd, { cwd });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

function setupRepo() {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "guard-repo-")));
  run(["git", "init", "-q"], repo);
  mkdirSync(join(repo, "sub"));
  writeFileSync(join(repo, "sub", "note.md"), "---\ntype: entity\n---\n\n## Facts\n\nx\n");
  run(["git", "add", "sub/note.md"], repo);
  run(["git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init"], repo);
  return repo;
}

test("子目錄以相對路徑呼叫：已 tracked 且違規的檔必須 exit 1，不得誤判為新檔", () => {
  const repo = setupRepo();
  const sub = join(repo, "sub");
  writeFileSync(join(sub, "note.md"), "---\ntype: entity\n---\n\n改掉了\n");
  const r = run(["bun", CLI, "note.md"], sub);
  expect(r.out).not.toContain("新檔案");
  expect(r.out).toContain("GUARD");
  expect(r.code).toBe(1);
});

test("HEAD 無此檔（新檔）→ 通過", () => {
  const repo = setupRepo();
  writeFileSync(join(repo, "new.md"), "---\ntype: entity\n---\n\n## Facts\n");
  const r = run(["bun", CLI, "new.md"], repo);
  expect(r.out).toContain("新檔案，通過");
  expect(r.code).toBe(0);
});
