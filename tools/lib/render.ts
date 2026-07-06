import { stripNoise } from "./noise";
import { deriveProjectSlug } from "./safety";
import { localDateISO } from "./dates";

export interface RenderedTranscript {
  markdown: string;
  sessionId: string;
  projectSlug: string | null;
  date: string;
  title: string;
}

const RESULT_HEAD_TAIL = 20;

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

export function renderTranscript(jsonlText: string, sessionId: string): RenderedTranscript {
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

  const body = turns
    .map((t) => `### ${t.role === "user" ? "User" : "Assistant"}\n\n${t.parts.join("\n\n")}`)
    .join("\n\n");

  return {
    markdown: body + "\n",
    sessionId,
    projectSlug: deriveProjectSlug(jsonlText),
    date: date || localDateISO(),
    title: title || "（無標題）",
  };
}
