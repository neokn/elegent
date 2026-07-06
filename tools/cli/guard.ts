import { readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { checkAugmentation } from "../lib/guard";

const file = process.argv[2];
if (!file) { console.error("用法: bun tools/cli/guard.ts <file>"); process.exit(2); }

const toplevel = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]).stdout.toString().trim();
if (!toplevel) { console.error("無法取得 git repo root（git rev-parse --show-toplevel 失敗，可能不在 git repo 內）"); process.exit(2); }

const abs = resolve(file);
const rootRel = relative(toplevel, abs);
// 先確認 HEAD 是否有此檔（區分「新檔」與「git 錯誤」）
const exists = Bun.spawnSync(["git", "cat-file", "-e", `HEAD:${rootRel}`], { cwd: toplevel });
if (exists.exitCode !== 0) { console.log("新檔案，通過"); process.exit(0); }

const head = Bun.spawnSync(["git", "show", `HEAD:${rootRel}`], { cwd: toplevel });
if (head.exitCode !== 0) { console.error("git show 失敗"); process.exit(2); } // 錯誤 ≠ 通過

const violations = checkAugmentation(head.stdout.toString(), readFileSync(abs, "utf8"));
for (const v of violations) console.log(`GUARD ${v}`);
process.exit(violations.length > 0 ? 1 : 0);
