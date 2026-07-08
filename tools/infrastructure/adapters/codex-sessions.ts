import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { CodexSessionLocator } from "@core/ports";
import {
  codexSessionIdsFromHookInput,
  codexTranscriptPathCandidatesFromHookInput,
  fallbackSessionIdFromPath,
  parseCodexSessionMeta,
} from "@core/parsers/codex";

/**
 * CodexSessionLocator 的實作（secondary adapter）：這裡是唯一「知道 Codex 把 rollout 存在
 * `$CODEX_HOME/sessions`（預設 `~/.codex/sessions`）」的地方。純解析（session_meta、hook 輸入
 * key 抽取）留在 core/parsers/codex；此檔只負責檔案系統走訪。
 */

function walkJsonl(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(full);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

function mtimeMs(p: string): number {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function samePath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return resolve(a) === resolve(b);
  }
}

export const nodeCodexSessionLocator: CodexSessionLocator = {
  locate(hookInput, cwd) {
    // 1. hook 輸入若已明講 transcript 路徑，直接用（存在才算）。
    const explicit = codexTranscriptPathCandidatesFromHookInput(hookInput).find((p) => existsSync(p));
    if (explicit) return { path: explicit, sessionId: null };

    // 2. 否則掃 sessions 目錄，依 session id（優先）或 cwd 找最新一筆。
    const sessionsRoot = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions");
    if (!existsSync(sessionsRoot)) return null;
    const files = walkJsonl(sessionsRoot).sort((a, b) => mtimeMs(b) - mtimeMs(a));
    const sessionIds = new Set(codexSessionIdsFromHookInput(hookInput));

    for (const file of files) {
      const meta = parseCodexSessionMeta(readFileSync(file, "utf8").split("\n", 1)[0] ?? "");
      if (sessionIds.size > 0) {
        const fb = fallbackSessionIdFromPath(file);
        if ((meta.sessionId && sessionIds.has(meta.sessionId)) || (fb && sessionIds.has(fb))) {
          return { path: file, sessionId: meta.sessionId ?? fb };
        }
        continue;
      }
      if (meta.cwd && samePath(meta.cwd, cwd)) return { path: file, sessionId: meta.sessionId };
    }
    return null;
  },
};
