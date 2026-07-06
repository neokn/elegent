import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderTranscript, type RenderedTranscript } from "./render";
import { sanitizeSessionId, validateTranscriptPath } from "./safety";
import { serializeNote } from "./frontmatter";
import { localDateISO } from "./dates";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function archiveTranscript(
  transcriptPath: string,
  vaultRoot: string,
  sessionId: string,
  rendered?: RenderedTranscript,
): { outPath: string; written: boolean } {
  const sid = sanitizeSessionId(sessionId);
  if (!sid) throw new Error(`非法 session id: ${sessionId}`);
  const tp = validateTranscriptPath(transcriptPath);
  if (!tp) throw new Error(`非法 transcript 路徑: ${transcriptPath}`);

  const r = rendered ?? renderTranscript(readFileSync(tp, "utf8"), sid);
  // render 出的 body 全空白（例如整段逐字稿都是被 stripNoise 濾掉的雜訊、或
  // 純工具呼叫沒有任何文字）：沒有值得歸檔的內容，不寫檔、不建目錄。
  if (!r.markdown.trim()) return { outPath: "", written: false };
  const date = DATE_RE.test(r.date) ? r.date : localDateISO();
  const dir = join(vaultRoot, "palace/raw/conversations", r.projectSlug ?? "unsorted");
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, `${date}_${sid}.md`);

  const content = serializeNote(
    {
      type: "raw-log",
      title: r.title,
      description: `對話逐字紀錄：${r.title}`,
      tags: ["palace/raw", "conversation"],
      timestamp: new Date().toISOString(),
      date,
      source: `claude-session:${sid}`,
      project: r.projectSlug ?? "unsorted",
    },
    r.markdown,
  );
  writeFileSync(outPath, content);
  return { outPath, written: true };
}
