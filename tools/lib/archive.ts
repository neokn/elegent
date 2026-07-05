import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderTranscript } from "./render";
import { sanitizeSessionId, validateTranscriptPath } from "./safety";
import { serializeNote } from "./frontmatter";

export function archiveTranscript(
  transcriptPath: string,
  vaultRoot: string,
  sessionId: string,
): { outPath: string; written: boolean } {
  const sid = sanitizeSessionId(sessionId);
  if (!sid) throw new Error(`非法 session id: ${sessionId}`);
  const tp = validateTranscriptPath(transcriptPath);
  if (!tp) throw new Error(`非法 transcript 路徑: ${transcriptPath}`);

  const jsonl = readFileSync(tp, "utf8");
  const r = renderTranscript(jsonl, sid);
  const dir = join(vaultRoot, "palace/raw/conversations", r.projectSlug ?? "unsorted");
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, `${r.date}_${sid}.md`);

  const content = serializeNote(
    {
      type: "raw-log",
      title: r.title,
      description: `對話逐字紀錄：${r.title}`,
      tags: ["palace/raw", "conversation"],
      timestamp: new Date().toISOString(),
      date: r.date,
      source: `claude-session:${sid}`,
      project: r.projectSlug ?? "unsorted",
    },
    r.markdown,
  );
  writeFileSync(outPath, content);
  return { outPath, written: true };
}
