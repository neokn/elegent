import { join } from "node:path";
import { lintVault, checkAnkipanImmutable } from "@core/application/lint";
import { nodeFileStore } from "@infrastructure/adapters/node-fs";
import { nodeGitRunner } from "@infrastructure/adapters/node-git";

/** `bun src/presentation/cli/lint.ts` 與 `elgt lint` 共用的入口邏輯；argv[0] 為選填的 vault 路徑。 */
export async function runLintEntry(argv: string[] = []): Promise<number> {
  const vaultRoot = argv[0] ?? join(process.cwd(), "vault");
  const r = lintVault(nodeFileStore, vaultRoot);

  // pensieve/ankipan（append-only 層）：保留檔（index.md/log.md，reindex 重生）忽略；
  // 刪除既有檔是硬錯誤，修改（通常是 hooks 對成長中 session 的冪等覆寫）降為警告。
  const ankipan = checkAnkipanImmutable(nodeGitRunner, vaultRoot, process.cwd());
  r.errors.push(...ankipan.errors);
  r.warnings.push(...ankipan.warnings);

  for (const e of r.errors) console.log(`ERROR ${e.rule} ${e.file} — ${e.message}`);
  for (const w of r.warnings) console.log(`WARN  ${w.rule} ${w.file} — ${w.message}`);
  console.log(`${r.errors.length} errors, ${r.warnings.length} warnings`);
  return r.errors.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  process.exit(await runLintEntry(process.argv.slice(2)));
}
