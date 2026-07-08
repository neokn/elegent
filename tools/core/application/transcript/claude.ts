import { basename } from "node:path";
import { stripNoise } from "@core/domain/noise";
import { localDateISO } from "@core/domain/dates";
import { sanitizeSessionId, slugify, validateTranscriptPath } from "@core/domain/safety";
import type { FileStore } from "@core/ports";
import {
  RESULT_HEAD_TAIL,
  renderTurns,
  writeConversationArchive,
  type ArchiveDescriptor,
  type RenderedTranscript,
} from "@core/application/transcript/transcript";

/**
 * Claude Code adapter：把 Claude 的 JSONL 逐字稿轉成統一的 `RenderedTranscript`，
 * 並歸檔。與 `tools/core/parsers/codex.ts` 互為同形 peer（各自解析自家格式，共用
 * `tools/core/transcript.ts` 的歸檔核心）。函式一律 `Claude` 具名，對齊 Codex 端的
 * `renderCodexTranscript`/`countCodexUserMessages`——避免「泛用檔名卻只綁 Claude」。
 */

export type { RenderedTranscript } from "@core/application/transcript/transcript";

const CLAUDE_DESCRIPTOR: ArchiveDescriptor = {
  sourceScheme: "claude-session",
  descriptionPrefix: "對話逐字紀錄：",
  projectWhenNull: true,
};

type Block = { type: string; text?: string; name?: string; input?: unknown; content?: unknown };

function clipResult(content: unknown): string {
  const text = typeof content === "string" ? content : JSON.stringify(content ?? "");
  const lines = text.split("\n");
  if (lines.length <= RESULT_HEAD_TAIL * 2) return text;
  const omitted = lines.length - RESULT_HEAD_TAIL * 2;
  return [...lines.slice(0, RESULT_HEAD_TAIL), `… (省略 ${omitted} 行)`, ...lines.slice(-RESULT_HEAD_TAIL)].join("\n");
}

function summarizeToolUse(b: Block): string {
  const input = JSON.stringify(b.input ?? {});
  const short = input.length > 120 ? input.slice(0, 120) + "…" : input;
  return `> 🔧 ${b.name ?? "tool"}(${short})`;
}

function extractParts(content: unknown): { text: string[]; tools: string[]; isToolResultOnly: boolean } {
  if (typeof content === "string") return { text: [content], tools: [], isToolResultOnly: false };
  const text: string[] = [];
  const tools: string[] = [];
  let sawText = false;
  if (Array.isArray(content)) {
    for (const b of content as Block[]) {
      if (b.type === "text" && b.text) { text.push(b.text); sawText = true; }
      else if (b.type === "tool_use") tools.push(summarizeToolUse(b));
      else if (b.type === "tool_result") tools.push("> 📥 result:\n" + clipResult(b.content).split("\n").map((l) => "> " + l).join("\n"));
    }
  }
  const isToolResultOnly = !sawText && tools.length > 0 && (content as Block[]).every((b) => b.type === "tool_result");
  return { text, tools, isToolResultOnly };
}

/** 讀 Claude JSONL 前 200 行的 top-level `cwd` 推導 project slug（Claude 逐字稿格式專屬）。 */
export function deriveClaudeProjectSlug(jsonlText: string): string | null {
  const lines = jsonlText.split("\n").slice(0, 200);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (typeof entry.cwd === "string" && entry.cwd.length > 0) {
        const slug = slugify(basename(entry.cwd));
        return slug || null;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function renderClaudeTranscript(jsonlText: string, sessionId: string): RenderedTranscript {
  const turns: { role: "user" | "assistant"; parts: string[] }[] = [];
  let date = "";
  let title = "";

  for (const line of jsonlText.split("\n")) {
    if (!line.trim()) continue;
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    const role = entry.type === "user" ? "user" : entry.type === "assistant" ? "assistant" : null;
    if (!role || !entry.message) continue;
    if (!date && typeof entry.timestamp === "string") date = localDateISO(new Date(entry.timestamp));

    const { text, tools, isToolResultOnly } = extractParts(entry.message.content);
    const cleanText = text.map((t) => stripNoise(t)).filter((t) => t.trim());
    const parts = [...cleanText, ...tools];
    if (parts.length === 0) continue;

    if (role === "user" && isToolResultOnly && turns.at(-1)?.role === "assistant") {
      turns.at(-1)!.parts.push(...parts);
      continue;
    }
    if (role === "user" && !title && cleanText[0]) title = cleanText[0].replace(/\s+/g, " ").trim().slice(0, 60);
    const last = turns.at(-1);
    if (last && last.role === role) last.parts.push(...parts);
    else turns.push({ role, parts });
  }

  return {
    markdown: renderTurns(turns) + "\n",
    sessionId,
    projectSlug: deriveClaudeProjectSlug(jsonlText),
    date: date || localDateISO(),
    title: title || "（無標題）",
  };
}

/** Claude 逐字稿的使用者回合數（供節流閘用）；跳過 slash command 與純 tool_result。 */
export function countClaudeUserMessages(jsonlText: string): number {
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

export function archiveClaudeTranscript(
  store: FileStore,
  transcriptPath: string,
  vaultRoot: string,
  sessionId: string,
  rendered?: RenderedTranscript,
): { outPath: string; written: boolean } {
  const sid = sanitizeSessionId(sessionId);
  if (!sid) throw new Error(`非法 session id: ${sessionId}`);
  const tp = validateTranscriptPath(transcriptPath);
  if (!tp) throw new Error(`非法 transcript 路徑: ${transcriptPath}`);

  const r = rendered ?? renderClaudeTranscript(store.read(tp), sid);
  return writeConversationArchive(store, vaultRoot, r, sid, CLAUDE_DESCRIPTOR);
}
