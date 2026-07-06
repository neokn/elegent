import skillDigest from "../assets/skill-digest.md" with { type: "text" };
import claudeMd from "../assets/claude-md.md" with { type: "text" };
import settingsJson from "../assets/settings-json.tmpl" with { type: "text" };
import mcpJson from "../assets/mcp-json.tmpl" with { type: "text" };
import gitignore from "../assets/gitignore.tmpl" with { type: "text" };

export type TemplateName = "skill-digest" | "claude-md" | "settings-json" | "mcp-json" | "gitignore";

export interface TemplateVars {
  PALACE_BIN: string;
}

const TEMPLATES: Record<TemplateName, string> = {
  "skill-digest": skillDigest,
  "claude-md": claudeMd,
  "settings-json": settingsJson,
  "mcp-json": mcpJson,
  gitignore,
};

/**
 * 從內嵌模板渲染出發佈版檔案內容：`{{PALACE_BIN}}` 全量替換成呼叫端指定的
 * 執行檔路徑/名稱（開發模式是 `bun tools/cli/palace.ts`，編譯後是 Task 26
 * 產出的單一執行檔路徑）。
 *
 * 模板以 Bun text import 內嵌（`with { type: "text" }`）——`bun build --compile`
 * 時內容會被打包進單一執行檔，不需要在發佈時額外攜帶 tools/assets/ 目錄。
 */
export function renderTemplate(name: TemplateName, vars: TemplateVars): string {
  return TEMPLATES[name].replaceAll("{{PALACE_BIN}}", vars.PALACE_BIN);
}
