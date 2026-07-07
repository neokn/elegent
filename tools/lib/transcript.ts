import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serializeNote } from "./frontmatter";
import { localDateISO } from "./dates";

/**
 * 跨 CLI 共用的逐字稿歸檔核心（格式無關）。
 *
 * 每個 agent CLI 的整合都是同一條管線：hook → 解析自家逐字稿 → 歸檔進
 * vault/palace/raw/conversations/<slug>/<date>_<sid>.md。解析（各 CLI 格式不同）由
 * 各自的 adapter（`tools/lib/claude.ts`、`tools/lib/codex.ts`、未來 `agy.ts`）負責，
 * 產出統一的 `RenderedTranscript`；「寫檔」這段完全相同，收斂在這裡，後端差異只剩一個
 * `ArchiveDescriptor` 資料物件——不再是各 adapter 複製一份歸檔邏輯（Codex 整合最初就是
 * 逐字複製了 Claude 的 archive，本檔即為消除該重複而生）。
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const RESULT_HEAD_TAIL = 20;

export interface RenderedTranscript {
  markdown: string;
  sessionId: string;
  projectSlug: string | null;
  date: string;
  title: string;
}

/** 各 CLI adapter 提供的歸檔差異描述子：只有這幾個欄位在後端間不同。 */
export interface ArchiveDescriptor {
  /** frontmatter `source` 的 scheme，例如 "claude-session" / "codex-session"。 */
  sourceScheme: string;
  /** 附加在 ["palace/raw","conversation"] 之後的額外 tags，例如 ["codex"]。 */
  extraTags?: string[];
  /** `description` 前綴，例如 "對話逐字紀錄：" / "Codex 對話逐字紀錄："。 */
  descriptionPrefix: string;
  /** projectSlug 為 null 時是否仍填 `project: "unsorted"`（Claude=true；Codex=false）。 */
  projectWhenNull: boolean;
}

/**
 * 把已渲染好的逐字稿寫進 vault。空白 markdown（整段都被雜訊過濾掉、或純工具呼叫）
 * 不寫檔、不建目錄，回 { outPath: "", written: false }。
 */
export function writeConversationArchive(
  vaultRoot: string,
  rendered: RenderedTranscript,
  sid: string,
  descriptor: ArchiveDescriptor,
): { outPath: string; written: boolean } {
  if (!rendered.markdown.trim()) return { outPath: "", written: false };
  const date = DATE_RE.test(rendered.date) ? rendered.date : localDateISO();
  const dir = join(vaultRoot, "palace/raw/conversations", rendered.projectSlug ?? "unsorted");
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, `${date}_${sid}.md`);
  const fm: Record<string, unknown> = {
    type: "raw-log",
    title: rendered.title,
    description: `${descriptor.descriptionPrefix}${rendered.title}`,
    tags: ["palace/raw", "conversation", ...(descriptor.extraTags ?? [])],
    timestamp: new Date().toISOString(),
    date,
    source: `${descriptor.sourceScheme}:${sid}`,
  };
  if (rendered.projectSlug) fm.project = rendered.projectSlug;
  else if (descriptor.projectWhenNull) fm.project = "unsorted";
  writeFileSync(outPath, serializeNote(fm, rendered.markdown));
  return { outPath, written: true };
}

/** turns → markdown（### User / ### Assistant 交錯）。跨 CLI 共用的序列化尾段（不含結尾換行）。 */
export function renderTurns(turns: { role: "user" | "assistant"; parts: string[] }[]): string {
  return turns
    .map((t) => `### ${t.role === "user" ? "User" : "Assistant"}\n\n${t.parts.join("\n\n")}`)
    .join("\n\n");
}
