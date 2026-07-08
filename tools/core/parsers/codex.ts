import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { FileStore } from "@core/ports";
import { localDateISO } from "@core/dates";
import { sanitizeSessionId, slugify } from "@core/safety";
import { stripNoise } from "@core/noise";
import {
  DATE_RE,
  RESULT_HEAD_TAIL,
  renderTurns,
  writeConversationArchive,
  type ArchiveDescriptor,
  type RenderedTranscript,
} from "@core/transcript";

export interface RenderedCodexTranscript extends RenderedTranscript {
  cwd: string | null;
}

const CODEX_DESCRIPTOR: ArchiveDescriptor = {
  sourceScheme: "codex-session",
  extraTags: ["codex"],
  descriptionPrefix: "Codex 對話逐字紀錄：",
  projectWhenNull: false,
};

export interface CodexSessionMatch {
  path: string;
  sessionId: string | null;
}

function clipResult(content: unknown): string {
  const text = typeof content === "string" ? content : JSON.stringify(content ?? "");
  const lines = text.split("\n");
  if (lines.length <= RESULT_HEAD_TAIL * 2) return text;
  const omitted = lines.length - RESULT_HEAD_TAIL * 2;
  return [...lines.slice(0, RESULT_HEAD_TAIL), `... (省略 ${omitted} 行)`, ...lines.slice(-RESULT_HEAD_TAIL)].join("\n");
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content as Array<Record<string, unknown>>) {
    if (block?.type === "input_text" && typeof block.text === "string") parts.push(block.text);
    if (block?.type === "output_text" && typeof block.text === "string") parts.push(block.text);
    if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  return parts.join("\n\n");
}

function pushTurn(turns: { role: "user" | "assistant"; parts: string[] }[], role: "user" | "assistant", text: string): void {
  const clean = stripNoise(text).trim();
  if (!clean) return;
  const last = turns.at(-1);
  if (last?.role === role) last.parts.push(clean);
  else turns.push({ role, parts: [clean] });
}

function pushTool(turns: { role: "user" | "assistant"; parts: string[] }[], text: string): void {
  const last = turns.at(-1);
  if (last?.role === "assistant") last.parts.push(text);
  else turns.push({ role: "assistant", parts: [text] });
}

function parseLine(line: string): any | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function fallbackSessionIdFromPath(path?: string): string | null {
  if (!path) return null;
  const name = basename(path, ".jsonl");
  const uuid = name.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  return uuid ?? name;
}

export function renderCodexTranscript(jsonlText: string, transcriptPath?: string): RenderedCodexTranscript {
  const turns: { role: "user" | "assistant"; parts: string[] }[] = [];
  const fallbackTurns: { role: "user" | "assistant"; parts: string[] }[] = [];
  let sessionId = fallbackSessionIdFromPath(transcriptPath) ?? "codex-session";
  let cwd: string | null = null;
  let date = "";
  let title = "";
  let sawEventConversation = false;

  for (const line of jsonlText.split("\n")) {
    const entry = parseLine(line);
    if (!entry) continue;
    if (!date && typeof entry.timestamp === "string") date = localDateISO(new Date(entry.timestamp));

    if (entry.type === "session_meta" && entry.payload && typeof entry.payload === "object") {
      const payload = entry.payload as Record<string, unknown>;
      if (typeof payload.session_id === "string") sessionId = payload.session_id;
      else if (typeof payload.id === "string") sessionId = payload.id;
      if (typeof payload.cwd === "string") cwd = payload.cwd;
      if (!date && typeof payload.timestamp === "string") date = localDateISO(new Date(payload.timestamp));
      continue;
    }

    if (entry.type === "event_msg" && entry.payload && typeof entry.payload === "object") {
      const payload = entry.payload as Record<string, unknown>;
      if (payload.type === "user_message" && typeof payload.message === "string") {
        sawEventConversation = true;
        if (!title) title = payload.message.replace(/\s+/g, " ").trim().slice(0, 60);
        pushTurn(turns, "user", payload.message);
      } else if (payload.type === "agent_message" && typeof payload.message === "string") {
        sawEventConversation = true;
        pushTurn(turns, "assistant", payload.message);
      }
      continue;
    }

    if (entry.type !== "response_item" || !entry.payload || typeof entry.payload !== "object") continue;
    const payload = entry.payload as Record<string, unknown>;
    if (payload.type === "function_call") {
      const args = typeof payload.arguments === "string" ? payload.arguments : JSON.stringify(payload.arguments ?? {});
      const short = args.length > 120 ? args.slice(0, 120) + "..." : args;
      pushTool(turns, `> Tool: ${String(payload.name ?? "tool")}(${short})`);
    } else if (payload.type === "function_call_output") {
      pushTool(turns, "> Result:\n" + clipResult(payload.output).split("\n").map((l) => "> " + l).join("\n"));
    } else if (payload.type === "message") {
      const role = payload.role === "user" ? "user" : payload.role === "assistant" ? "assistant" : null;
      if (!role) continue;
      const text = contentText(payload.content);
      if (!text.trim() || text.includes("<environment_context>") || text.includes("<turn_aborted>")) continue;
      if (role === "user" && !title) title = text.replace(/\s+/g, " ").trim().slice(0, 60);
      pushTurn(fallbackTurns, role, text);
    }
  }

  const selectedTurns = sawEventConversation ? turns : fallbackTurns;
  const body = renderTurns(selectedTurns);
  const projectSlug = cwd ? slugify(basename(cwd)) || null : null;
  return {
    markdown: body ? body + "\n" : "",
    sessionId,
    projectSlug,
    date: DATE_RE.test(date) ? date : localDateISO(),
    title: title || "（無標題）",
    cwd,
  };
}

export function countCodexUserMessages(jsonlText: string): number {
  let eventCount = 0;
  let fallbackCount = 0;
  for (const line of jsonlText.split("\n")) {
    const entry = parseLine(line);
    if (!entry) continue;
    if (entry.type === "event_msg" && entry.payload?.type === "user_message" && typeof entry.payload.message === "string") {
      eventCount++;
      continue;
    }
    if (entry.type === "response_item" && entry.payload?.type === "message" && entry.payload.role === "user") {
      const text = contentText(entry.payload.content);
      if (text.trim() && !text.includes("<environment_context>") && !text.includes("<turn_aborted>")) fallbackCount++;
    }
  }
  return eventCount || fallbackCount;
}

export function archiveCodexTranscript(
  store: FileStore,
  transcriptPath: string,
  vaultRoot: string,
  rendered?: RenderedCodexTranscript,
): { outPath: string; written: boolean } {
  const tp = resolve(transcriptPath);
  if (!tp.endsWith(".jsonl")) throw new Error(`非法 Codex transcript 路徑: ${transcriptPath}`);
  const r = rendered ?? renderCodexTranscript(store.read(tp), tp);
  const sid = sanitizeSessionId(r.sessionId);
  if (!sid) throw new Error(`非法 Codex session id: ${r.sessionId}`);
  return writeConversationArchive(store, vaultRoot, r, sid, CODEX_DESCRIPTOR);
}

function readMeta(store: FileStore, path: string): { sessionId: string | null; cwd: string | null } {
  const first = store.read(path).split("\n", 1)[0] ?? "";
  const entry = parseLine(first);
  const payload = entry?.type === "session_meta" && entry.payload && typeof entry.payload === "object" ? entry.payload : null;
  return {
    sessionId: typeof payload?.session_id === "string" ? payload.session_id : typeof payload?.id === "string" ? payload.id : null,
    cwd: typeof payload?.cwd === "string" ? payload.cwd : null,
  };
}

function samePath(store: FileStore, a: string, b: string): boolean {
  try {
    return store.realpath(a) === store.realpath(b);
  } catch {
    return resolve(a) === resolve(b);
  }
}

function stringValuesForKeys(value: unknown, keys: Set<string>, out: string[], depth = 0): void {
  if (depth > 4 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) stringValuesForKeys(item, keys, out, depth + 1);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(obj)) {
    if (keys.has(key) && typeof item === "string") out.push(item);
    else stringValuesForKeys(item, keys, out, depth + 1);
  }
}

export function codexSessionIdsFromHookInput(input: unknown): string[] {
  const out: string[] = [];
  stringValuesForKeys(input, new Set(["session_id", "sessionId", "conversation_id", "conversationId", "thread_id", "threadId"]), out);
  return [...new Set(out)];
}

export function codexTranscriptPathsFromHookInput(store: FileStore, input: unknown): string[] {
  const out: string[] = [];
  stringValuesForKeys(
    input,
    new Set(["transcript_path", "transcriptPath", "transcript_file", "transcriptFile", "session_path", "sessionPath", "session_file", "sessionFile"]),
    out,
  );
  return [...new Set(out.map((p) => resolve(p)).filter((p) => p.endsWith(".jsonl") && store.exists(p)))];
}

export function findLatestCodexSessionFile(
  store: FileStore,
  opts: { cwd: string; sessionsRoot?: string; sessionIds?: string[] },
): CodexSessionMatch | null {
  const sessionsRoot = opts.sessionsRoot ?? join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions");
  if (!store.exists(sessionsRoot)) return null;
  const files = store.walkFiles(sessionsRoot, ".jsonl");
  files.sort((a, b) => (store.mtimeMs(b) ?? 0) - (store.mtimeMs(a) ?? 0));
  const sessionIds = new Set(opts.sessionIds ?? []);

  for (const file of files) {
    const meta = readMeta(store, file);
    if (sessionIds.size > 0) {
      const fallback = fallbackSessionIdFromPath(file);
      if ((meta.sessionId && sessionIds.has(meta.sessionId)) || (fallback && sessionIds.has(fallback))) {
        return { path: file, sessionId: meta.sessionId ?? fallback };
      }
      continue;
    }
    if (meta.cwd && samePath(store, meta.cwd, opts.cwd)) return { path: file, sessionId: meta.sessionId };
  }
  return null;
}

export function findCodexTranscriptForHook(
  store: FileStore,
  input: unknown,
  cwd: string,
  sessionsRoot?: string,
): CodexSessionMatch | null {
  const explicit = codexTranscriptPathsFromHookInput(store, input)[0];
  if (explicit) return { path: explicit, sessionId: null };
  return findLatestCodexSessionFile(store, { cwd, sessionsRoot, sessionIds: codexSessionIdsFromHookInput(input) });
}
