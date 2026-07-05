import { readFileSync } from "node:fs";
import { checkAugmentation } from "../lib/guard";

const file = process.argv[2];
if (!file) { console.error("用法: bun tools/cli/guard.ts <file>"); process.exit(2); }

const head = Bun.spawnSync(["git", "show", `HEAD:${file}`]);
if (head.exitCode !== 0) { console.log("新檔案，通過"); process.exit(0); }

const violations = checkAugmentation(head.stdout.toString(), readFileSync(file, "utf8"));
for (const v of violations) console.log(`GUARD ${v}`);
process.exit(violations.length > 0 ? 1 : 0);
