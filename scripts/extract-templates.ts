import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEV_ELEGENT_BIN } from "../tools/core/templates";

const REPO_ROOT = resolve(import.meta.dir, "..");

/**
 * 開發時實際被 Claude Code 讀取、手改、立刻能測出效果的是 `.claude/skills/digest/SKILL.md`
 * ——這才是自然的編輯熱點，改行為就直接改這份。方向因此是反過來：拿這份手改過的
 * 檔案，把裡面 `DEV_ELEGENT_BIN` 的呼叫形式換回通用佔位符 `{{ELEGENT_BIN}}`，回寫進
 * `tools/assets/skill-digest.md`（真正要 ship 給 `elgt init` 使用者的模板來源）。
 * `tools/lib/templates.test.ts` 有測試斷言兩邊渲染後逐字一致，防止漂移。
 */
const EXTRACTED_FILES: Array<{ devRel: string; templateRel: string }> = [
  { devRel: ".claude/skills/digest/SKILL.md", templateRel: "tools/assets/skill-digest.md" },
];

async function main(): Promise<number> {
  let changed = 0;
  for (const { devRel, templateRel } of EXTRACTED_FILES) {
    const devPath = resolve(REPO_ROOT, devRel);
    const templatePath = resolve(REPO_ROOT, templateRel);
    const extracted = readFileSync(devPath, "utf8").replaceAll(DEV_ELEGENT_BIN, "{{ELEGENT_BIN}}");
    const current = readFileSync(templatePath, "utf8");
    if (current === extracted) {
      console.log(`ok（無變動）: ${templateRel}`);
      continue;
    }
    writeFileSync(templatePath, extracted);
    changed++;
    console.log(`已從 ${devRel} 萃取回 ${templateRel}`);
  }
  console.log(changed === 0 ? "\n全部已同步，無需變更。" : `\n同步了 ${changed} 個檔案。`);
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
