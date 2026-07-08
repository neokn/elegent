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
 * Antigravity CLI (agy) adapter：把 agy 的 JSONL 逐字稿轉成統一的 `RenderedTranscript`，
 * 並歸檔。
 */

export type { RenderedTranscript } from "@core/application/transcript/transcript";

const AGY_DESCRIPTOR: ArchiveDescriptor = {
  sourceScheme: "agy-session",
  extraTags: ["agy"],
  descriptionPrefix: "Antigravity 對話逐字紀錄：",
  projectWhenNull: true,
};

function clipResult(content: unknown): string {
  const text = typeof content === "string" ? content : JSON.stringify(content ?? "");
  const lines = text.split("\n");
  if (lines.length <= RESULT_HEAD_TAIL * 2) return text;
  const omitted = lines.length - RESULT_HEAD_TAIL * 2;
  return [...lines.slice(0, RESULT_HEAD_TAIL), `… (省略 ${omitted} 行)`, ...lines.slice(-RESULT_HEAD_TAIL)].join("\n");
}

function summarizeToolUse(tool: any): string {
  const args = JSON.stringify(tool.args ?? {});
  const short = args.length > 120 ? args.slice(0, 120) + "…" : args;
  return `> 🔧 ${tool.name ?? "tool"}(${short})`;
}

/** 讀 agy JSONL 前 200 行的 top-level `workspacePaths` 推導 project slug。 */
export function deriveAgyProjectSlug(jsonlText: string): string | null {
  const lines = jsonlText.split("\n").slice(0, 200);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (Array.isArray(entry.workspacePaths) && entry.workspacePaths.length > 0) {
        const p = entry.workspacePaths[0];
        if (typeof p === "string" && p.length > 0) {
          const slug = slugify(basename(p));
          return slug || null;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function renderAgyTranscript(
  jsonlText: string,
  sessionId: string,
  projectSlug?: string | null,
): RenderedTranscript {
  const turns: { role: "user" | "assistant"; parts: string[] }[] = [];
  let date = "";
  let title = "";

  for (const line of jsonlText.split("\n")) {
    if (!line.trim()) continue;
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    
    if (!date && typeof entry.created_at === "string") {
      date = localDateISO(new Date(entry.created_at));
    }

    if (entry.type === "USER_INPUT" && entry.source === "USER_EXPLICIT") {
      const rawText = typeof entry.content === "string" ? entry.content : "";
      const cleanText = stripNoise(rawText).trim();
      if (!cleanText) continue;

      if (!title) {
        title = cleanText.replace(/\s+/g, " ").trim().slice(0, 60);
      }

      const last = turns.at(-1);
      if (last && last.role === "user") {
        last.parts.push(cleanText);
      } else {
        turns.push({ role: "user", parts: [cleanText] });
      }
    } else if (entry.type === "PLANNER_RESPONSE" && entry.source === "MODEL") {
      const parts: string[] = [];
      if (typeof entry.content === "string" && entry.content.trim()) {
        parts.push(stripNoise(entry.content).trim());
      }
      if (Array.isArray(entry.tool_calls)) {
        for (const tool of entry.tool_calls) {
          parts.push(summarizeToolUse(tool));
        }
      }
      if (parts.length === 0) continue;

      const last = turns.at(-1);
      if (last && last.role === "assistant") {
        last.parts.push(...parts);
      } else {
        turns.push({ role: "assistant", parts });
      }
    } else if (
      entry.source === "MODEL" && 
      entry.type !== "PLANNER_RESPONSE" && 
      entry.type !== "CONVERSATION_HISTORY"
    ) {
      const resultText = "> 📥 result:\n" + clipResult(entry.content).split("\n").map((l) => "> " + l).join("\n");
      const last = turns.at(-1);
      if (last && last.role === "assistant") {
        last.parts.push(resultText);
      } else {
        turns.push({ role: "assistant", parts: [resultText] });
      }
    }
  }

  return {
    markdown: renderTurns(turns) + "\n",
    sessionId,
    projectSlug: projectSlug !== undefined ? projectSlug : deriveAgyProjectSlug(jsonlText),
    date: date || localDateISO(),
    title: title || "（無標題）",
  };
}

/** agy 逐字稿的使用者回合數（供節流閘用） */
export function countAgyUserMessages(jsonlText: string): number {
  let n = 0;
  for (const line of jsonlText.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.type === "USER_INPUT" && e.source === "USER_EXPLICIT" && typeof e.content === "string") {
        n++;
      }
    } catch { continue; }
  }
  return n;
}

export function archiveAgyTranscript(
  store: FileStore,
  transcriptPath: string,
  vaultRoot: string,
  sessionId: string,
  rendered?: RenderedTranscript,
  projectSlug?: string | null,
): { outPath: string; written: boolean } {
  const sid = sanitizeSessionId(sessionId);
  if (!sid) throw new Error(`非法 session id: ${sessionId}`);
  const tp = validateTranscriptPath(transcriptPath);
  if (!tp) throw new Error(`非法 transcript 路徑: ${transcriptPath}`);

  const r = rendered ?? renderAgyTranscript(store.read(tp), sid, projectSlug);
  return writeConversationArchive(store, vaultRoot, r, sid, AGY_DESCRIPTOR);
}
