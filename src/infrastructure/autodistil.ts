import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isCompiledRuntime } from "@core/version";

const LOCK_FILE = "distil.lock";
const LOG_FILE = "autodistil.log";

/**
 * headless distil 的啟動指令。
 * `--permission-mode acceptEdits` 只放行檔案編輯；/distil SKILL 還需要跑
 * `bun src/presentation/cli/guard.ts`、`bun run reindex` / `bun run lint:vault`、
 * `git add` / `git commit`——headless 無 TTY 無法互動授權，因此用
 * `--allowedTools` 明確放行這些指令，否則蒸餾會卡在權限提示直接中止。
 *
 * 動態組出 allowedTools：開發模式（`bun src/...` 直接跑）走既有 bun 清單；
 * 編譯後的 elgt binary（`isCompiledRuntime(execPath)` 為 true）另外還需要放行呼叫
 * 自身執行檔本身的指令（例如發佈版 SKILL 會用 `{{ELEGENT_BIN}} guard` 取代
 * `bun src/presentation/cli/guard.ts`，見 src/core/templates.ts），因此追加一條
 * `Bash(<execPath>:*)`，兩份清單並列、向下相容。
 *
 * compiled/dev 判斷委派給 src/core/version.ts 的 `isCompiledRuntime`（ELEGENT_COMPILED
 * define 優先、執行檔路徑後綴 fallback），與 elgt.ts 的 `resolveElegentBin` 共用同一份
 * 邏輯，避免兩處各自維護一份不一致的後綴清單。
 *
 * `execPath` 參數預設 `process.execPath`，僅供測試注入（避免測試行為隨執行
 * 當下的 bun 安裝路徑而不確定——例如某些 bun 發行版的實際檔名是 `bun.exe`）。
 */
export function buildDistilCmd(execPath: string = process.execPath): string[] {
  const allowed = ["Bash(bun run:*)", "Bash(bun src/presentation/cli/guard.ts:*)", "Bash(git add:*)", "Bash(git commit:*)"];
  if (isCompiledRuntime(execPath)) {
    allowed.push(`Bash(${execPath}:*)`);
  }
  return ["claude", "-p", "/distil", "--permission-mode", "acceptEdits", "--allowedTools", allowed.join(",")];
}

function stateDir(repoRoot: string): string {
  const d = join(repoRoot, ".elegent-state");
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
 * 判斷是否可以 spawn 一個新的 headless distil 子程序。
 *
 * 防重入邏輯：`.elegent-state/distil.lock` 內存的是持有者 PID（取鎖瞬間是
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
export function shouldSpawnDistil(repoRoot: string): boolean {
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
  if (!shouldSpawnDistil(repoRoot)) return false; // 持有者存活 → 跳過
  rmSync(p, { force: true }); // stale lock（死 PID）→ 自癒：移除後重試
  return tryWrite();
}

export type SpawnFn = (
  cmd: string[],
  opts: { cwd: string; stdio: ["ignore", number, number]; env: Record<string, string | undefined> },
) => { pid: number; unref: () => void };

/**
 * Spawn 一個 headless distil 子程序（`claude -p /distil ...`）。
 * 回傳是否真的 spawn 了（原子取鎖失敗 → false）。
 *
 * 流程：先以父程序 PID 原子取鎖（見 acquireLock）→ spawn → 覆寫 lock 為
 * 子程序 PID → unref。子程序的 stdout/stderr append 到
 * `.elegent-state/autodistil.log`，headless 蒸餾失敗時可據此診斷。
 *
 * `spawn` 透過參數注入（預設 `Bun.spawn`），讓測試可以替換掉真正呼叫 claude
 * CLI 的行為，避免測試期間真的產生子程序。
 *
 * 子程序 env 覆寫 `ELEGENT_AUTO_DISTIL=0`、`ELEGENT_HEADLESS_DISTIL=1`：預設
 * `Bun.spawn` 會整個繼承父程序 `process.env`（含 `ELEGENT_AUTO_DISTIL=1`），
 * 若不覆寫，子程序（headless `/distil`）跑完 SessionEnd/Stop hooks 時會
 * 再次判斷「已開啟自動蒸餾」而遞迴 spawn 下一個 headless distil，形成永不
 * 停止的蒸餾鏈。`ELEGENT_HEADLESS_DISTIL=1` 則讓子程序的 hooks 認出自己是
 * headless distil session，直接放行不歸檔（見 hooks 入口的判斷），避免
 * 館員自己的工作逐字稿被當成使用者記憶素材歸檔進 vault、下次又被蒸餾。
 *
 * 已知限制：Bun.spawn 沒有 node 的 `detached` 選項可另起 process group；
 * `unref()` 只是讓父程序不等子程序結束就能退出，若父程序的 process group
 * 收到訊號（如整組被 SIGHUP/SIGTERM），子程序仍可能被一併帶走。此時 lock
 * 殘留死 PID，由 shouldSpawnDistil 的自癒設計接住，下次 SessionEnd 會重試。
 */
/**
 * headless distil 的工作目錄：user scope 的 distil skill 裝在 vault 內
 * （`<vault>/.claude/skills/distil/`），claude CLI 只從 cwd 的專案層探索 skill，
 * 因此 vault 內有 skill 就以 vault 為 cwd；否則（project/local scope 裝在
 * targetDir）維持 repoRoot。用檔案探測而非傳遞 scope 設定：hook 執行期不知道
 * init 當時的 scope，skill 實際在哪就去哪，三種 scope 自動正確。
 */
export function distilCwd(repoRoot: string, vaultRoot: string): string {
  return existsSync(join(vaultRoot, ".claude/skills/distil/SKILL.md")) ? vaultRoot : repoRoot;
}

export function spawnAutoDistil(
  repoRoot: string,
  spawn: SpawnFn = Bun.spawn as unknown as SpawnFn,
  cwd: string = repoRoot,
): boolean {
  if (!acquireLock(repoRoot)) return false;
  const logFd = openSync(join(stateDir(repoRoot), LOG_FILE), "a");
  try {
    const proc = spawn(buildDistilCmd(), {
      cwd,
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env, ELEGENT_AUTO_DISTIL: "0", ELEGENT_HEADLESS_DISTIL: "1" },
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

export interface MaybeAutoDistilOpts {
  /** ELEGENT_AUTO_DISTIL === "1"（預設關閉——headless 蒸餾耗 token，使用者顯式開啟） */
  enabled: boolean;
  /** 本次 SessionEnd 是否成功完成歸檔（歸檔失敗就沒有新素材，不值得花 token 蒸餾） */
  archivedOk: boolean;
  repoRoot: string;
  /** vault 絕對路徑；vault 內有 distil skill 時 headless distil 以此為 cwd（見 distilCwd） */
  vaultRoot: string;
  /** 測試注入點；預設 shouldSpawnDistil */
  shouldSpawn?: (repoRoot: string) => boolean;
  /** 測試注入點；預設 Bun.spawn */
  spawn?: SpawnFn;
}

/**
 * SessionEnd 的自動蒸餾觸發判斷（純邏輯、可測）：
 * enabled 且 archivedOk 且無存活的蒸餾程序時，spawn 並回傳 true；
 * 任一條件不滿足回傳 false。入口（sessionend.ts）只做接線。
 */
export function maybeAutoDistil(opts: MaybeAutoDistilOpts): boolean {
  if (!opts.enabled || !opts.archivedOk) return false;
  const shouldSpawn = opts.shouldSpawn ?? shouldSpawnDistil;
  if (!shouldSpawn(opts.repoRoot)) return false;
  return spawnAutoDistil(opts.repoRoot, opts.spawn, distilCwd(opts.repoRoot, opts.vaultRoot));
}
