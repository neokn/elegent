import { join } from "node:path";
import { regenerateIndexes } from "../lib/indexgen";

/** `bun tools/cli/reindex.ts` 與 `elgt reindex` 共用的入口邏輯；argv[0] 為選填的 vault 路徑。 */
export async function runReindexEntry(argv: string[] = []): Promise<number> {
  const written = regenerateIndexes(argv[0] ?? join(process.cwd(), "vault"));
  console.log(`重生 ${written.length} 份 index.md`);
  return 0;
}

if (import.meta.main) {
  process.exit(await runReindexEntry(process.argv.slice(2)));
}
