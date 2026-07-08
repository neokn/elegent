import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldSpawnDigest, spawnAutoDigest, maybeAutoDigest, buildDigestCmd, type SpawnFn } from "./autodigest";

function makeFakeSpawn(pid = 4242) {
  const calls: Array<{
    cmd: string[];
    opts: { cwd: string; stdio: [unknown, unknown, unknown]; env: Record<string, string | undefined> };
  }> = [];
  let unrefCalled = false;
  const spawn: SpawnFn = (cmd, opts) => {
    calls.push({ cmd, opts });
    return { pid, unref: () => { unrefCalled = true; } };
  };
  return { spawn, calls, wasUnrefCalled: () => unrefCalled };
}

test("無 lock 時可 spawn，lock 含存活 PID 時跳過", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  expect(shouldSpawnDigest(root)).toBe(true);
  mkdirSync(join(root, ".elegent-state"), { recursive: true });
  writeFileSync(join(root, ".elegent-state/digest.lock"), String(process.pid)); // 用本測試程序 PID 模擬存活
  expect(shouldSpawnDigest(root)).toBe(false);
});

test("lock 含死 PID 視為過期", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  mkdirSync(join(root, ".elegent-state"), { recursive: true });
  writeFileSync(join(root, ".elegent-state/digest.lock"), "999999");
  expect(shouldSpawnDigest(root)).toBe(true);
});

test("lock 內容為壞值時視為過期", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  mkdirSync(join(root, ".elegent-state"), { recursive: true });
  writeFileSync(join(root, ".elegent-state/digest.lock"), "not-a-pid");
  expect(shouldSpawnDigest(root)).toBe(true);
});

test("shouldSpawnDigest 會自建 .elegent-state 目錄", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  expect(shouldSpawnDigest(root)).toBe(true);
});

test("buildDigestCmd：execPath 以 /bun 結尾（開發模式）不追加 execPath 項", () => {
  expect(buildDigestCmd("/usr/local/bin/bun")).toEqual([
    "claude", "-p", "/digest",
    "--permission-mode", "acceptEdits",
    "--allowedTools", "Bash(bun run:*),Bash(bun tools/presentation/cli/guard.ts:*),Bash(git add:*),Bash(git commit:*)",
  ]);
});

test("buildDigestCmd：execPath 非 /bun 結尾（compiled binary）追加 Bash(<execPath>:*)，與既有 bun 清單並列", () => {
  expect(buildDigestCmd("/usr/local/bin/elgt")).toEqual([
    "claude", "-p", "/digest",
    "--permission-mode", "acceptEdits",
    "--allowedTools",
    "Bash(bun run:*),Bash(bun tools/presentation/cli/guard.ts:*),Bash(git add:*),Bash(git commit:*),Bash(/usr/local/bin/elgt:*)",
  ]);
});

test("buildDigestCmd：無參數時預設用 process.execPath", () => {
  expect(buildDigestCmd()).toEqual(buildDigestCmd(process.execPath));
});

test("spawnAutoDigest：正確指令（含 allowedTools）、cwd、stdout/stderr 導到 autodigest.log", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  const fake = makeFakeSpawn(4242);

  expect(spawnAutoDigest(root, fake.spawn)).toBe(true);

  expect(fake.calls.length).toBe(1);
  expect(fake.calls[0].cmd).toEqual(buildDigestCmd());
  expect(fake.calls[0].opts.cwd).toBe(root);
  const [i, o, e] = fake.calls[0].opts.stdio;
  expect(i).toBe("ignore");
  expect(typeof o).toBe("number"); // append fd，不再 ignore——headless 失敗可診斷
  expect(e).toBe(o);
  expect(existsSync(join(root, ".elegent-state/autodigest.log"))).toBe(true);
  expect(fake.wasUnrefCalled()).toBe(true);
  expect(readFileSync(join(root, ".elegent-state/digest.lock"), "utf8")).toBe("4242");
});

test("spawnAutoDigest：子程序 env 覆寫 ELEGENT_AUTO_DIGEST=0 與 ELEGENT_HEADLESS_DIGEST=1（防子程序自我參照與遞迴繼承）", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  const fake = makeFakeSpawn(4242);

  expect(spawnAutoDigest(root, fake.spawn)).toBe(true);

  const env = fake.calls[0].opts.env;
  expect(env.ELEGENT_AUTO_DIGEST).toBe("0");
  expect(env.ELEGENT_HEADLESS_DIGEST).toBe("1");
});

test("spawnAutoDigest：先以父程序 PID 原子取鎖，spawn 後才覆寫為子程序 PID", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  let lockDuringSpawn = "";
  const spawn: SpawnFn = () => {
    lockDuringSpawn = readFileSync(join(root, ".elegent-state/digest.lock"), "utf8");
    return { pid: 4242, unref: () => {} };
  };

  expect(spawnAutoDigest(root, spawn)).toBe(true);

  expect(lockDuringSpawn).toBe(String(process.pid)); // TOCTOU 防護：spawn 前 lock 已被本程序持有
  expect(readFileSync(join(root, ".elegent-state/digest.lock"), "utf8")).toBe("4242");
});

test("spawnAutoDigest：lock 含存活 PID 時取鎖失敗，回 false 且不 spawn", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  mkdirSync(join(root, ".elegent-state"), { recursive: true });
  writeFileSync(join(root, ".elegent-state/digest.lock"), String(process.pid));
  const fake = makeFakeSpawn();

  expect(spawnAutoDigest(root, fake.spawn)).toBe(false);
  expect(fake.calls.length).toBe(0);
});

test("spawnAutoDigest：殘留死 PID 的 stale lock 會被移除並成功取鎖（自癒）", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  mkdirSync(join(root, ".elegent-state"), { recursive: true });
  writeFileSync(join(root, ".elegent-state/digest.lock"), "999999");
  const fake = makeFakeSpawn(4242);

  expect(spawnAutoDigest(root, fake.spawn)).toBe(true);
  expect(fake.calls.length).toBe(1);
  expect(readFileSync(join(root, ".elegent-state/digest.lock"), "utf8")).toBe("4242");
});

test("spawnAutoDigest：spawn 拋錯時釋放 lock 並向上拋", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  const spawn: SpawnFn = () => { throw new Error("spawn boom"); };

  expect(() => spawnAutoDigest(root, spawn)).toThrow("spawn boom");
  expect(existsSync(join(root, ".elegent-state/digest.lock"))).toBe(false);
});

test("spawnAutoDigest 之後，shouldSpawnDigest 對存活子程序回 false", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  const spawn: SpawnFn = () => ({
    pid: process.pid, // 用本測試程序 PID 模擬「子程序仍存活」
    unref: () => {},
  });

  expect(spawnAutoDigest(root, spawn)).toBe(true);
  expect(shouldSpawnDigest(root)).toBe(false);
});

test("maybeAutoDigest：enabled=false 不觸發", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  const fake = makeFakeSpawn();
  expect(maybeAutoDigest({ enabled: false, archivedOk: true, repoRoot: root, spawn: fake.spawn })).toBe(false);
  expect(fake.calls.length).toBe(0);
});

test("maybeAutoDigest：archivedOk=false 不觸發", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  const fake = makeFakeSpawn();
  expect(maybeAutoDigest({ enabled: true, archivedOk: false, repoRoot: root, spawn: fake.spawn })).toBe(false);
  expect(fake.calls.length).toBe(0);
});

test("maybeAutoDigest：lock 含存活 PID 不觸發", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  mkdirSync(join(root, ".elegent-state"), { recursive: true });
  writeFileSync(join(root, ".elegent-state/digest.lock"), String(process.pid));
  const fake = makeFakeSpawn();
  expect(maybeAutoDigest({ enabled: true, archivedOk: true, repoRoot: root, spawn: fake.spawn })).toBe(false);
  expect(fake.calls.length).toBe(0);
});

test("maybeAutoDigest：全綠時觸發並回 true", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  const fake = makeFakeSpawn();
  expect(maybeAutoDigest({ enabled: true, archivedOk: true, repoRoot: root, spawn: fake.spawn })).toBe(true);
  expect(fake.calls.length).toBe(1);
});

test("maybeAutoDigest：可注入 shouldSpawn（回 false 時不觸發）", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  const fake = makeFakeSpawn();
  expect(
    maybeAutoDigest({ enabled: true, archivedOk: true, repoRoot: root, shouldSpawn: () => false, spawn: fake.spawn }),
  ).toBe(false);
  expect(fake.calls.length).toBe(0);
});
