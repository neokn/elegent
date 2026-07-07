import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeSessionId } from "./safety";

export const SAVE_INTERVAL = 15;

function stateDir(repoRoot: string): string {
  const d = join(repoRoot, ".elegent-state");
  mkdirSync(d, { recursive: true });
  return d;
}

function markerPath(repoRoot: string, sessionId: string): string {
  if (!sanitizeSessionId(sessionId)) throw new Error(`非法 session id: ${sessionId}`);
  return join(stateDir(repoRoot), `${sessionId}_last_save`);
}

export function countUserMessages(jsonlText: string): number {
  let n = 0;
  for (const line of jsonlText.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.type !== "user" || !e.message) continue;
      const c = e.message.content;
      if (typeof c === "string") {
        if (!c.includes("<command-message>")) n++;
      } else if (Array.isArray(c)) {
        const hasText = c.some((b: any) => b.type === "text" && b.text && !String(b.text).includes("<command-message>"));
        if (hasText) n++;
      }
    } catch { continue; }
  }
  return n;
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
