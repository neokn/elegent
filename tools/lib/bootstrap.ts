import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { scaffoldVault } from "../cli/scaffold";
import { renderTemplate, type TemplateName } from "./templates";

export interface BootstrapResult {
  created: string[];
  skipped: string[];
  warnings: string[];
}

/** 從模板渲染出來、寫進目標資料夾根目錄的檔案（絕不覆寫既有檔）。 */
const RENDERED_FILES: Array<{ rel: string; template: TemplateName }> = [
  { rel: ".claude/settings.json", template: "settings-json" },
  { rel: ".claude/skills/digest/SKILL.md", template: "skill-digest" },
  { rel: "CLAUDE.md", template: "claude-md" },
  { rel: ".mcp.json", template: "mcp-json" },
  { rel: ".gitignore", template: "gitignore" },
];

/**
 * .mcp.json 的 `command` 是 exec 語意（多數 MCP 客戶端不經 shell 直接 spawn），
 * 開發模式的 palaceBin 是兩段字串（`bun /abs/palace.ts`）——原樣寫進 command 會 ENOENT。
 * render 後 parse：command 含空白時拆段，第一段當 command，其餘段接到 args 前面
 * （`command: "bun", args: ["/abs/palace.ts", "mcp"]`）。settings.json 不需要這個處理——
 * hooks 的 command 是 shell 字串，兩段合法。
 */
function normalizeMcpJson(rendered: string): string {
  const parsed = JSON.parse(rendered) as {
    mcpServers?: Record<string, { command?: string; args?: string[] }>;
  };
  for (const server of Object.values(parsed.mcpServers ?? {})) {
    if (server.command?.includes(" ")) {
      const [head, ...rest] = server.command.split(" ");
      server.command = head;
      server.args = [...rest, ...(server.args ?? [])];
    }
  }
  return JSON.stringify(parsed, null, 2) + "\n";
}

/**
 * 在（通常是空的）資料夾裡一鍵建立完整記憶系統：
 *   1. `mkdirSync(targetDir)` + `scaffoldVault(targetDir/vault)`（Task 6 模組，冪等不覆寫）
 *   2. 從內嵌模板寫入 settings/skill/CLAUDE.md/mcp/gitignore（已存在→略過，絕不覆寫）
 *   3. 非 git repo → `git init -b main`（git 不可用/失敗只警告，不中斷、不 throw）
 *   4. 回傳 `{ created, skipped, warnings }`；呼叫端（palace init）據此印出下一步指引
 *
 * 全程冪等：對同一個 targetDir 重複呼叫，第二次之後 created 應為空、既有檔內容不變。
 */
export function bootstrap(targetDir: string, palaceBin: string): BootstrapResult {
  const created: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  mkdirSync(targetDir, { recursive: true });
  created.push(...scaffoldVault(join(targetDir, "vault")));

  for (const { rel, template } of RENDERED_FILES) {
    const p = join(targetDir, rel);
    if (existsSync(p)) {
      skipped.push(p);
      continue;
    }
    mkdirSync(dirname(p), { recursive: true });
    let content = renderTemplate(template, { PALACE_BIN: palaceBin });
    if (template === "mcp-json") content = normalizeMcpJson(content);
    writeFileSync(p, content);
    created.push(p);
  }

  if (!existsSync(join(targetDir, ".git"))) {
    try {
      const result = Bun.spawnSync(["git", "init", "-b", "main"], { cwd: targetDir });
      if (result.exitCode !== 0) {
        const detail = result.stderr?.toString().trim() || `exit ${result.exitCode}`;
        warnings.push(`git init 失敗：${detail}`);
      }
    } catch (err) {
      warnings.push(`git 不可用，略過 git init：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { created, skipped, warnings };
}
