import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { archiveTranscript } from "../lib/archive";
import { renderTranscript } from "../lib/render";
import { sanitizeSessionId } from "../lib/safety";

function findJsonl(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...findJsonl(p));
    else if (e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

export function backfill(
  projectsDir: string,
  vaultRoot: string,
): { archived: string[]; skipped: string[]; failed: string[] } {
  const archived: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  if (!existsSync(projectsDir)) return { archived, skipped, failed };
  for (const file of findJsonl(projectsDir)) {
    const sid = sanitizeSessionId(basename(file, ".jsonl"));
    if (!sid) continue;
    try {
      const r = renderTranscript(readFileSync(file, "utf8"), sid);
      const target = join(vaultRoot, "palace/raw/conversations", r.projectSlug ?? "unsorted", `${r.date}_${sid}.md`);
      if (existsSync(target)) { skipped.push(file); continue; }
      archiveTranscript(file, vaultRoot, sid, r);
      archived.push(file);
    } catch {
      failed.push(file);
    }
  }
  return { archived, skipped, failed };
}

if (import.meta.main) {
  const projectsDir = process.argv[2] ?? join(homedir(), ".claude/projects");
  const vault = join(process.cwd(), "vault");
  const r = backfill(projectsDir, vault);
  console.log(`歸檔 ${r.archived.length} 個 session，跳過 ${r.skipped.length} 個（已存在），失敗 ${r.failed.length} 個`);
}
