import skillDigest from "../../assets/skill-digest.md" with { type: "text" };
import settingsJson from "../../assets/settings-json.tmpl.md" with { type: "text" };
import gitignore from "../../assets/gitignore.tmpl.md" with { type: "text" };
import codexHooks from "../../assets/codex-hooks.tmpl.md" with { type: "text" };
import agyHooks from "../../assets/agy-hooks.tmpl.md" with { type: "text" };
import codexMcp from "../../assets/codex-mcp.tmpl.md" with { type: "text" };

export type TemplateName = "skill-digest" | "settings-json" | "gitignore" | "codex-hooks" | "agy-hooks" | "codex-mcp";

export interface TemplateVars {
  ELEGENT_BIN: string;
  ELEGENT_HOOK_COMMAND?: string;
  ELEGENT_BASH_ALLOW?: string;
}

/**
 * 本 repo（開發中）自己在用的檔案（例如 `.claude/skills/digest/SKILL.md`，開發時
 * 直接手改這份）裡呼叫 elgt 的形式。`scripts/extract-templates.ts` 拿它把手改過的
 * 檔案換回通用佔位符 `{{ELEGENT_BIN}}`、回寫進 `src/assets/`；防漂移測試也共用
 * 這個值來驗證兩邊渲染後一致。
 */
export const DEV_ELEGENT_BIN = "bun src/presentation/cli/elgt.ts";

const TEMPLATES: Record<TemplateName, string> = {
  "skill-digest": skillDigest,
  "settings-json": settingsJson,
  gitignore,
  "codex-hooks": codexHooks,
  "agy-hooks": agyHooks,
  "codex-mcp": codexMcp,
};

/**
 * 從內嵌模板渲染出發佈版檔案內容：`{{ELEGENT_BIN}}` 全量替換成呼叫端指定的
 * 執行檔路徑/名稱（開發模式是 `bun src/presentation/cli/elgt.ts`，編譯後是 Task 26
 * 產出的單一執行檔路徑）。
 *
 * 模板以 Bun text import 內嵌（`with { type: "text" }`）——`bun build --compile`
 * 時內容會被打包進單一執行檔，不需要在發佈時額外攜帶 src/assets/ 目錄。
 */
export function renderTemplate(name: TemplateName, vars: TemplateVars): string {
  return TEMPLATES[name]
    .replaceAll("{{ELEGENT_BIN}}", vars.ELEGENT_BIN)
    .replaceAll("{{ELEGENT_HOOK_COMMAND}}", vars.ELEGENT_HOOK_COMMAND ?? vars.ELEGENT_BIN)
    .replaceAll("{{ELEGENT_BASH_ALLOW}}", vars.ELEGENT_BASH_ALLOW ?? vars.ELEGENT_BIN);
}

/**
 * Codex 的 `.codex/config.toml` 沒有 project-scope `mcp add`，只能直接產生
 * `[mcp_servers.elegent-memory]` 片段附加進去。elegentBin 兩段時（開發模式
 * `bun /abs/elgt.ts`）第一段當 command、其餘接進 args 前面，語意同
 * `bootstrap.ts` 的 `normalizeMcpJson`。
 */
export function renderCodexMcpToml(elegentBin: string, vaultRoot: string): string {
  const parts = elegentBin.split(" ").filter(Boolean);
  const [command, ...rest] = parts;
  const args = [...rest, "mcp"].map((a) => JSON.stringify(a)).join(", ");
  return TEMPLATES["codex-mcp"]
    .replaceAll("{{ELEGENT_MCP_COMMAND}}", command)
    .replaceAll("{{ELEGENT_MCP_ARGS}}", args)
    .replaceAll("{{ELEGENT_VAULT}}", vaultRoot);
}
