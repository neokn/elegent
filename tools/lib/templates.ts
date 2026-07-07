import skillDigest from "../assets/skill-digest.md" with { type: "text" };
import claudeMd from "../assets/claude-md.md" with { type: "text" };
import settingsJson from "../assets/settings-json.tmpl" with { type: "text" };
import mcpJson from "../assets/mcp-json.tmpl" with { type: "text" };
import gitignore from "../assets/gitignore.tmpl" with { type: "text" };

export type TemplateName = "skill-digest" | "claude-md" | "settings-json" | "mcp-json" | "gitignore";

export interface TemplateVars {
  ELEGENT_BIN: string;
}

/**
 * 本 repo（開發中）自己在用的檔案（例如 `.claude/skills/digest/SKILL.md`，開發時
 * 直接手改這份）裡呼叫 elgt 的形式。`scripts/extract-templates.ts` 拿它把手改過的
 * 檔案換回通用佔位符 `{{ELEGENT_BIN}}`、回寫進 `tools/assets/`；防漂移測試也共用
 * 這個值來驗證兩邊渲染後一致。
 */
export const DEV_ELEGENT_BIN = "bun tools/cli/elgt.ts";

const TEMPLATES: Record<TemplateName, string> = {
  "skill-digest": skillDigest,
  "claude-md": claudeMd,
  "settings-json": settingsJson,
  "mcp-json": mcpJson,
  gitignore,
};

/**
 * 從內嵌模板渲染出發佈版檔案內容：`{{ELEGENT_BIN}}` 全量替換成呼叫端指定的
 * 執行檔路徑/名稱（開發模式是 `bun tools/cli/elgt.ts`，編譯後是 Task 26
 * 產出的單一執行檔路徑）。
 *
 * 模板以 Bun text import 內嵌（`with { type: "text" }`）——`bun build --compile`
 * 時內容會被打包進單一執行檔，不需要在發佈時額外攜帶 tools/assets/ 目錄。
 */
export function renderTemplate(name: TemplateName, vars: TemplateVars): string {
  return TEMPLATES[name].replaceAll("{{ELEGENT_BIN}}", vars.ELEGENT_BIN);
}
