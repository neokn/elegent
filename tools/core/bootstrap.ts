import { join } from "node:path";
import { scaffoldVault } from "./scaffold";
import { renderTemplate, type TemplateName } from "./templates";
import { regenerateIndexes } from "./indexgen";
import type { FileStore, ProcessRunner } from "./ports";

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
  // Codex CLI 的 lifecycle hooks（schema 與 Claude Code 相同）；Stop/PreCompact 時歸檔對話。
  // 首次要在 Codex CLI 內 `/hooks` 檢視並信任專案層 hooks 後才會執行（Codex hook trust）。
  { rel: ".codex/hooks.json", template: "codex-hooks" },
];

/**
 * 讓多家 agent CLI 拿到同一份專案指示：Codex CLI 與 Antigravity(`agy`) 都原生讀 `AGENTS.md`
 * （不讀 CLAUDE.md），Claude Code 讀 `CLAUDE.md`。以 symlink 指向 `CLAUDE.md` 作為單一來源
 * （零漂移）。symlink 不被檔案系統支援時（例如未開啟符號連結的 Windows）只警告、不中斷。
 * （Gemini CLI 預設讀 GEMINI.md，需自行設 contextFileName=AGENTS.md，這裡不代為產生。）
 */
const CONTEXT_SYMLINKS: Array<{ link: string; target: string }> = [
  { link: "AGENTS.md", target: "CLAUDE.md" },
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
export function bootstrap(
  store: FileStore,
  proc: ProcessRunner,
  targetDir: string,
  elegentBin: string,
): BootstrapResult {
  const created: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  store.mkdirp(targetDir);
  created.push(...scaffoldVault(store, join(targetDir, "vault")));
  // scaffoldVault 手寫的 index.md 只在根目錄，指向的五個子目錄 index.md（projects/areas/
  // resources/archives/palace）尚不存在——首次 lint 會報 5 個 broken-link 警告。這裡立刻
  // 補生成，讓 init 首跑就是 0 warnings。
  regenerateIndexes(store, join(targetDir, "vault"));

  for (const { rel, template } of RENDERED_FILES) {
    const p = join(targetDir, rel);
    if (store.exists(p)) {
      skipped.push(p);
      continue;
    }
    let content = renderTemplate(template, { ELEGENT_BIN: elegentBin });
    if (template === "mcp-json") content = normalizeMcpJson(content);
    store.write(p, content);
    created.push(p);
  }

  // CLAUDE.md 已由上面的 RENDERED_FILES 迴圈寫出，這裡才建指向它的 symlink。
  for (const { link, target } of CONTEXT_SYMLINKS) {
    const p = join(targetDir, link);
    // lexists（不跟隨連結）：既有的實體檔或（即使壞掉的）symlink 都算數，一律略過不覆寫。
    if (store.lexists(p)) {
      skipped.push(p);
      continue;
    }
    try {
      store.symlink(target, p);
      created.push(p);
    } catch (err) {
      warnings.push(
        `建立 ${link} → ${target} symlink 失敗（檔案系統可能不支援符號連結）：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (!store.exists(join(targetDir, ".git"))) {
    try {
      // 明確傳 env: process.env（見 ProcessRunner）：讓呼叫端／測試在同一行程內動態調整
      // GIT_AUTHOR_*／GIT_CONFIG_* 等變數能反映到 git 子行程。
      const runOpts = { cwd: targetDir, env: process.env };
      const initResult = proc.run(["git", "init", "-b", "main"], runOpts);
      if (initResult.exitCode !== 0) {
        const detail = initResult.stderr.trim() || `exit ${initResult.exitCode}`;
        warnings.push(`git init 失敗：${detail}`);
      } else {
        // 初始 commit：讓 init 完成時已有一個乾淨的起點可 diff。commit 失敗最常見的原因是
        // git identity 未設定——不代為設定（不動使用者的 git config），只警告、不中斷。
        const addResult = proc.run(["git", "add", "-A"], runOpts);
        if (addResult.exitCode !== 0) {
          const detail = addResult.stderr.trim() || `exit ${addResult.exitCode}`;
          warnings.push(`git add 失敗：${detail}`);
        } else {
          const commitResult = proc.run(["git", "commit", "-m", "init: EleGent 記憶系統初始化"], runOpts);
          if (commitResult.exitCode !== 0) {
            const detail = commitResult.stderr.trim() || `exit ${commitResult.exitCode}`;
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
