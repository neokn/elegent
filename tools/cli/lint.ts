import { join, relative } from "node:path";
import { lintVault, type LintIssue } from "../lib/lint";

const vaultRoot = process.argv[2] ?? join(process.cwd(), "vault");
const r = lintVault(vaultRoot);

// 硬錯誤：palace/raw 底下「已追蹤且被修改/刪除」的檔案（新檔 A 允許，M/D 違反 append-only）
const diff = Bun.spawnSync(["git", "diff", "--name-status", "HEAD", "--", join(relative(process.cwd(), vaultRoot), "palace/raw")]);
if (diff.exitCode === 0) {
  for (const line of diff.stdout.toString().split("\n")) {
    const [status, file] = line.split("\t");
    if (status === "M" || status === "D") {
      r.errors.push({ file: file ?? "", rule: "raw-immutable", message: "palace/raw 為 append-only，不可修改或刪除既有檔" });
    }
  }
}

for (const e of r.errors) console.log(`ERROR ${e.rule} ${e.file} — ${e.message}`);
for (const w of r.warnings) console.log(`WARN  ${w.rule} ${w.file} — ${w.message}`);
console.log(`${r.errors.length} errors, ${r.warnings.length} warnings`);
process.exit(r.errors.length > 0 ? 1 : 0);
