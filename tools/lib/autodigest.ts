import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOCK_FILE = "digest.lock";
const LOG_FILE = "autodigest.log";

/**
 * headless digest 的啟動指令。
 * `--permission-mode acceptEdits` 只放行檔案編輯；/digest SKILL 還需要跑
 * `bun tools/cli/guard.ts`、`bun run reindex` / `bun run lint:vault`、
 * `git add` / `git commit`——headless 無 TTY 無法互動授權，因此用
 * `--allowedTools` 明確放行這些指令，否則蒸餾會卡在權限提示直接中止。
 */
const DIGEST_CMD = [
  "claude", "-p", "/digest",
  "--permission-mode", "acceptEdits",
  "--allowedTools", "Bash(bun run:*),Bash(bun tools/cli/guard.ts:*),Bash(git add:*),Bash(git commit:*)",
];

function stateDir(repoRoot: string): string {
  const d = join(repoRoot, ".palace-state");
  mkdirSync(d, { recursive: true });
  return d;
}

function lockPath(repoRoot: string): string {
  return join(stateDir(repoRoot), LOCK_FILE);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 判斷是否可以 spawn 一個新的 headless digest 子程序。
 *
 * 防重入邏輯：`.palace-state/digest.lock` 內存的是持有者 PID（取鎖瞬間是
 * 父程序 PID，spawn 成功後覆寫為子程序 PID）。若該 PID 仍存活，代表已有
 * 一個蒸餾流程在跑，回傳 false（跳過）；若 lock 不存在、內容無法解析、
 * 或 PID 已死亡，回傳 true。
 *
 * 設計備忘（lock 清理）：spawn 出去的子程序結束後，lock 檔會殘留該（已死亡）
 * PID——這裡刻意不做主動清理。因為下次呼叫本函式時，對死 PID 的判斷本來就
 * 會回傳 true，等同 lock 自動視為過期並放行下一次 spawn（stale lock 會在
 * 下次取鎖時被移除）。同理，父程序在「取鎖 → spawn」之間掛掉，lock 殘留的
 * 也是死 PID，一樣被自癒接住。這是刻意的 self-healing 設計：不需要額外的
 * lock 清除或逾時機制，殘留的死 PID 只是暫時佔用一個檔案，不影響正確性。
 */
export function shouldSpawnDigest(repoRoot: string): boolean {
  const p = lockPath(repoRoot);
  if (!existsSync(p)) return true;
  const raw = readFileSync(p, "utf8").trim();
  const pid = parseInt(raw, 10);
  if (!Number.isInteger(pid) || pid <= 0) return true;
  return !isAlive(pid);
}

/**
 * 原子取鎖：以 `wx` flag 寫入自己的 PID——檔案已存在則 EEXIST，避免
 * 「check 完才 write」的 TOCTOU 競態。EEXIST 時檢查持有者是否存活：
 * 存活 → 取鎖失敗；已死（stale lock）→ 移除後重試一次。
 */
function acquireLock(repoRoot: string): boolean {
  const p = lockPath(repoRoot);
  const tryWrite = (): boolean => {
    try {
      writeFileSync(p, String(process.pid), { flag: "wx" });
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "EEXIST") return false;
      throw err;
    }
  };
  if (tryWrite()) return true;
  if (!shouldSpawnDigest(repoRoot)) return false; // 持有者存活 → 跳過
  rmSync(p, { force: true }); // stale lock（死 PID）→ 自癒：移除後重試
  return tryWrite();
}

export type SpawnFn = (
  cmd: string[],
  opts: { cwd: string; stdio: ["ignore", number, number] },
) => { pid: number; unref: () => void };

/**
 * Spawn 一個 headless digest 子程序（`claude -p /digest ...`）。
 * 回傳是否真的 spawn 了（原子取鎖失敗 → false）。
 *
 * 流程：先以父程序 PID 原子取鎖（見 acquireLock）→ spawn → 覆寫 lock 為
 * 子程序 PID → unref。子程序的 stdout/stderr append 到
 * `.palace-state/autodigest.log`，headless 蒸餾失敗時可據此診斷。
 *
 * `spawn` 透過參數注入（預設 `Bun.spawn`），讓測試可以替換掉真正呼叫 claude
 * CLI 的行為，避免測試期間真的產生子程序。
 *
 * 已知限制：Bun.spawn 沒有 node 的 `detached` 選項可另起 process group；
 * `unref()` 只是讓父程序不等子程序結束就能退出，若父程序的 process group
 * 收到訊號（如整組被 SIGHUP/SIGTERM），子程序仍可能被一併帶走。此時 lock
 * 殘留死 PID，由 shouldSpawnDigest 的自癒設計接住，下次 SessionEnd 會重試。
 */
export function spawnAutoDigest(
  repoRoot: string,
  spawn: SpawnFn = Bun.spawn as unknown as SpawnFn,
): boolean {
  if (!acquireLock(repoRoot)) return false;
  const logFd = openSync(join(stateDir(repoRoot), LOG_FILE), "a");
  try {
    const proc = spawn(DIGEST_CMD, {
      cwd: repoRoot,
      stdio: ["ignore", logFd, logFd],
    });
    writeFileSync(lockPath(repoRoot), String(proc.pid));
    proc.unref();
    return true;
  } catch (err) {
    rmSync(lockPath(repoRoot), { force: true }); // spawn 失敗 → 釋放 lock，不留殘骸
    throw err;
  } finally {
    closeSync(logFd); // 子程序已持有 fd 的複本，父程序的複本用完即關
  }
}

export interface MaybeAutoDigestOpts {
  /** PALACE_AUTO_DIGEST === "1"（預設關閉——headless 蒸餾耗 token，使用者顯式開啟） */
  enabled: boolean;
  /** 本次 SessionEnd 是否成功完成歸檔（歸檔失敗就沒有新素材，不值得花 token 蒸餾） */
  archivedOk: boolean;
  repoRoot: string;
  /** 測試注入點；預設 shouldSpawnDigest */
  shouldSpawn?: (repoRoot: string) => boolean;
  /** 測試注入點；預設 Bun.spawn */
  spawn?: SpawnFn;
}

/**
 * SessionEnd 的自動蒸餾觸發判斷（純邏輯、可測）：
 * enabled 且 archivedOk 且無存活的蒸餾程序時，spawn 並回傳 true；
 * 任一條件不滿足回傳 false。入口（sessionend.ts）只做接線。
 */
export function maybeAutoDigest(opts: MaybeAutoDigestOpts): boolean {
  if (!opts.enabled || !opts.archivedOk) return false;
  const shouldSpawn = opts.shouldSpawn ?? shouldSpawnDigest;
  if (!shouldSpawn(opts.repoRoot)) return false;
  return spawnAutoDigest(opts.repoRoot, opts.spawn);
}
