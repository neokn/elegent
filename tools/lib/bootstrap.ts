import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { scaffoldVault } from "../cli/scaffold";
import { renderTemplate, type TemplateName } from "./templates";
import { regenerateIndexes } from "./indexgen";

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
 * 開發模式的 elegentBin 是兩段字串（`bun /abs/elgt.ts`）——原樣寫進 command 會 ENOENT。
 * render 後 parse：command 含空白時拆段，第一段當 command，其餘段接到 args 前面
 * （`command: "bun", args: ["/abs/elgt.ts", "mcp"]`）。settings.json 不需要這個處理——
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
 *   4. 回傳 `{ created, skipped, warnings }`；呼叫端（elgt init）據此印出下一步指引
 *
 * 全程冪等：對同一個 targetDir 重複呼叫，第二次之後 created 應為空、既有檔內容不變。
 */
export function bootstrap(targetDir: string, elegentBin: string): BootstrapResult {
  const created: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  mkdirSync(targetDir, { recursive: true });
  created.push(...scaffoldVault(join(targetDir, "vault")));
  // scaffoldVault 手寫的 index.md 只在根目錄，指向的五個子目錄 index.md（projects/areas/
  // resources/archives/palace）尚不存在——首次 lint 會報 5 個 broken-link 警告。這裡立刻
  // 補生成，讓 init 首跑就是 0 warnings。
  regenerateIndexes(join(targetDir, "vault"));

  for (const { rel, template } of RENDERED_FILES) {
    const p = join(targetDir, rel);
    if (existsSync(p)) {
      skipped.push(p);
      continue;
    }
    mkdirSync(dirname(p), { recursive: true });
    let content = renderTemplate(template, { ELEGENT_BIN: elegentBin });
    if (template === "mcp-json") content = normalizeMcpJson(content);
    writeFileSync(p, content);
    created.push(p);
  }

  if (!existsSync(join(targetDir, ".git"))) {
    try {
      // 明確傳 env: process.env（而非讓 Bun.spawnSync 用預設值）：Bun 的預設繼承環境是
      // process 啟動當下的快照，執行期間對 process.env 的修改不會反映到子行程——會影響
      // 呼叫端／測試在同一行程內動態調整 GIT_AUTHOR_*／GIT_CONFIG_* 等變數的能力。
      const spawnOpts = { cwd: targetDir, env: process.env };
      const initResult = Bun.spawnSync(["git", "init", "-b", "main"], spawnOpts);
      if (initResult.exitCode !== 0) {
        const detail = initResult.stderr?.toString().trim() || `exit ${initResult.exitCode}`;
        warnings.push(`git init 失敗：${detail}`);
      } else {
        // 初始 commit：讓 init 完成時已有一個乾淨的起點可 diff。commit 失敗最常見的原因是
        // git identity 未設定——不代為設定（不動使用者的 git config），只警告、不中斷。
        const addResult = Bun.spawnSync(["git", "add", "-A"], spawnOpts);
        if (addResult.exitCode !== 0) {
          const detail = addResult.stderr?.toString().trim() || `exit ${addResult.exitCode}`;
          warnings.push(`git add 失敗：${detail}`);
        } else {
          const commitResult = Bun.spawnSync(
            ["git", "commit", "-m", "init: EleGent 記憶系統初始化"],
            spawnOpts,
          );
          if (commitResult.exitCode !== 0) {
            const detail = commitResult.stderr?.toString().trim() || `exit ${commitResult.exitCode}`;
            warnings.push(`git commit 失敗，可能是 git identity 未設定——請執行 git config user.name / user.email 後自行 commit：${detail}`);
          }
        }
      }
    } catch (err) {
      warnings.push(`git 不可用，略過 git init：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { created, skipped, warnings };
}
