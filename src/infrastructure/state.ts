import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeSessionId } from "@core/domain/safety";

/** Stop hook 歸檔門檻：距上次歸檔累積滿此數的新 user 訊息才寫檔。1 = 每次來回都記；游標仍防同輪重複 Stop 空寫。 */
export const SAVE_INTERVAL = 1;

function stateDir(repoRoot: string): string {
  const d = join(repoRoot, ".elegent-state");
  mkdirSync(d, { recursive: true });
  return d;
}

function markerPath(repoRoot: string, sessionId: string): string {
  if (!sanitizeSessionId(sessionId)) throw new Error(`非法 session id: ${sessionId}`);
  return join(stateDir(repoRoot), `${sessionId}_last_save`);
}

export function readLastSave(repoRoot: string, sessionId: string): number {
  const p = markerPath(repoRoot, sessionId);
  if (!existsSync(p)) return 0;
  const raw = readFileSync(p, "utf8").trim();
  if (!/^\d+$/.test(raw)) return 0;
  return parseInt(raw, 10);
}

export function writeLastSave(repoRoot: string, sessionId: string, count: number): void {
  writeFileSync(markerPath(repoRoot, sessionId), String(count));
}

export function clearSession(repoRoot: string, sessionId: string): void {
  rmSync(markerPath(repoRoot, sessionId), { force: true });
}

export function logHookError(repoRoot: string, hook: string, err: unknown): void {
  const line = `${new Date().toISOString()} [${hook}] ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`;
  appendFileSync(join(stateDir(repoRoot), "hooks.log"), line);
}
