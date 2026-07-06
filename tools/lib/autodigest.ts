import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOCK_FILE = "digest.lock";

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
 * 防重入邏輯：`.palace-state/digest.lock` 內存的是上一次 spawnAutoDigest
 * 產生之子程序的 PID。若該 PID 仍存活，代表已有一個蒸餾程序在跑，回傳
 * false（跳過）；若 lock 不存在、內容無法解析、或 PID 已死亡，回傳 true。
 *
 * 設計備忘（lock 清理）：spawn 出去的子程序結束後，lock 檔會殘留該（已死亡）
 * PID——這裡刻意不做主動清理。因為下次呼叫本函式時，對死 PID 的判斷本來就
 * 會回傳 true，等同 lock 自動視為過期並放行下一次 spawn。這是刻意的自癒
 * （self-healing）設計：不需要額外的 lock 清除或逾時機制，殘留的死 PID
 * 只是暫時佔用一個檔案，不影響正確性。
 */
export function shouldSpawnDigest(repoRoot: string): boolean {
  const p = lockPath(repoRoot);
  if (!existsSync(p)) return true;
  const raw = readFileSync(p, "utf8").trim();
  const pid = parseInt(raw, 10);
  if (!Number.isInteger(pid) || pid <= 0) return true;
  return !isAlive(pid);
}

export type SpawnFn = (
  cmd: string[],
  opts: { cwd: string; stdio: [string, string, string] },
) => { pid: number; unref: () => void };

/**
 * Spawn 一個 detached 的 headless digest 子程序（`claude -p /digest ...`），
 * 並把子程序 PID 寫入 `.palace-state/digest.lock` 供 shouldSpawnDigest 防重入。
 *
 * `spawn` 透過參數注入（預設 `Bun.spawn`），讓測試可以替換掉真正呼叫 claude
 * CLI 的行為，避免測試期間真的產生子程序。
 */
export function spawnAutoDigest(
  repoRoot: string,
  spawn: SpawnFn = Bun.spawn as unknown as SpawnFn,
): void {
  stateDir(repoRoot);
  const proc = spawn(["claude", "-p", "/digest", "--permission-mode", "acceptEdits"], {
    cwd: repoRoot,
    stdio: ["ignore", "ignore", "ignore"],
  });
  writeFileSync(lockPath(repoRoot), String(proc.pid));
  proc.unref();
}
