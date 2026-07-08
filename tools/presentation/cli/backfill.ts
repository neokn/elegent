import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { archiveClaudeTranscript, renderClaudeTranscript } from "@core/parsers/claude";
import { nodeFileStore } from "@infrastructure/node-fs";
import { sanitizeSessionId } from "@core/safety";

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
      const r = renderClaudeTranscript(readFileSync(file, "utf8"), sid);
      const target = join(vaultRoot, "palace/raw/conversations", r.projectSlug ?? "unsorted", `${r.date}_${sid}.md`);
      if (existsSync(target)) { skipped.push(file); continue; }
      archiveClaudeTranscript(nodeFileStore, file, vaultRoot, sid, r);
      archived.push(file);
    } catch {
      failed.push(file);
    }
  }
  return { archived, skipped, failed };
}

/** `bun tools/presentation/cli/backfill.ts` 與 `elgt backfill` 共用的入口邏輯；argv[0] 為選填的 projects 目錄。 */
export async function runBackfillEntry(argv: string[] = []): Promise<number> {
  const projectsDir = argv[0] ?? join(homedir(), ".claude/projects");
  const vault = join(process.cwd(), "vault");
  const r = backfill(projectsDir, vault);
  console.log(`歸檔 ${r.archived.length} 個 session，跳過 ${r.skipped.length} 個（已存在），失敗 ${r.failed.length} 個`);
  return 0;
}

if (import.meta.main) {
  process.exit(await runBackfillEntry(process.argv.slice(2)));
}
