import { join } from "node:path";
import { lintVault, checkRawImmutable } from "../lib/lint";

const vaultRoot = process.argv[2] ?? join(process.cwd(), "vault");
const r = lintVault(vaultRoot);

// palace/raw（append-only 層）：保留檔（index.md/log.md，reindex 重生）忽略；
// 刪除既有檔是硬錯誤，修改（通常是 hooks 對成長中 session 的冪等覆寫）降為警告。
const raw = checkRawImmutable(vaultRoot, process.cwd());
r.errors.push(...raw.errors);
r.warnings.push(...raw.warnings);

for (const e of r.errors) console.log(`ERROR ${e.rule} ${e.file} — ${e.message}`);
for (const w of r.warnings) console.log(`WARN  ${w.rule} ${w.file} — ${w.message}`);
console.log(`${r.errors.length} errors, ${r.warnings.length} warnings`);
process.exit(r.errors.length > 0 ? 1 : 0);
