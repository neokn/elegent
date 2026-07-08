import { join } from "node:path";
import { scaffoldVault } from "@core/scaffold";
import { nodeFileStore } from "@infrastructure/adapters/node-fs";

/** `bun tools/presentation/cli/scaffold.ts [dir]` 的入口；argv[0] 為選填的 vault 路徑（bootstrap 直接呼叫 scaffoldVault）。 */
export async function runScaffoldEntry(argv: string[] = []): Promise<number> {
  const root = argv[0] ?? join(process.cwd(), "vault");
  const created = scaffoldVault(nodeFileStore, root);
  console.log(created.length ? `建立 ${created.length} 個檔案` : "骨架已存在，未變更");
  return 0;
}

if (import.meta.main) {
  process.exit(await runScaffoldEntry(process.argv.slice(2)));
}
