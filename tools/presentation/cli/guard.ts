import { readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { checkAugmentation } from "@core/domain/guard";

/**
 * `bun tools/presentation/cli/guard.ts` 與 `elgt guard` 共用的入口邏輯；argv[0] 為必要的檔案路徑。
 * exit code：0 通過（新檔或無違規）、1 有違規、2 用法錯誤／git 操作失敗。
 */
export async function runGuardEntry(argv: string[] = []): Promise<number> {
  const file = argv[0];
  if (!file) { console.error("用法: elgt guard <file>（或 bun tools/presentation/cli/guard.ts <file>）"); return 2; }

  const toplevel = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]).stdout.toString().trim();
  if (!toplevel) { console.error("無法取得 git repo root（git rev-parse --show-toplevel 失敗，可能不在 git repo 內）"); return 2; }

  const abs = resolve(file);
  const rootRel = relative(toplevel, abs);
  // 先確認 HEAD 是否有此檔（區分「新檔」與「git 錯誤」）
  const exists = Bun.spawnSync(["git", "cat-file", "-e", `HEAD:${rootRel}`], { cwd: toplevel });
  if (exists.exitCode !== 0) { console.log("新檔案，通過"); return 0; }

  const head = Bun.spawnSync(["git", "show", `HEAD:${rootRel}`], { cwd: toplevel });
  if (head.exitCode !== 0) { console.error("git show 失敗"); return 2; } // 錯誤 ≠ 通過

  const violations = checkAugmentation(head.stdout.toString(), readFileSync(abs, "utf8"));
  for (const v of violations) console.log(`GUARD ${v}`);
  return violations.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  process.exit(await runGuardEntry(process.argv.slice(2)));
}
