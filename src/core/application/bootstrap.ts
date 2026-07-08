import { join } from "node:path";
import { scaffoldVault } from "@core/application/scaffold";
import { renderTemplate, type TemplateName } from "@core/application/templates";
import { regenerateIndexes } from "@core/application/indexgen";
import { slugify } from "@core/domain/safety";
import type { FileStore, GitRunner } from "@core/ports";

export interface BootstrapResult {
  created: string[];
  skipped: string[];
  warnings: string[];
}

export type AgentConfigScope = "project" | "user" | "none";

export interface BootstrapOptions {
  vaultName?: string;
  claudeScope?: AgentConfigScope;
  codexScope?: AgentConfigScope;
  claudeUserDir?: string;
  codexUserDir?: string;
}

interface RenderedFile {
  base: string;
  rel: string;
  template: TemplateName;
  hookCommand?: string;
  bashAllow?: string;
}

const ROOT_RENDERED_FILES: Array<{ rel: string; template: TemplateName }> = [
  { rel: "CLAUDE.md", template: "claude-md" },
  { rel: ".mcp.json", template: "mcp-json" },
  { rel: ".gitignore", template: "gitignore" },
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
function normalizeMcpJson(rendered: string, vaultRoot: string): string {
  const parsed = JSON.parse(rendered) as {
    mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }>;
  };
  for (const server of Object.values(parsed.mcpServers ?? {})) {
    if (server.command?.includes(" ")) {
      const [head, ...rest] = server.command.split(" ");
      server.command = head;
      server.args = [...rest, ...(server.args ?? [])];
    }
    server.env = { ...(server.env ?? {}), ELEGENT_VAULT: vaultRoot };
  }
  return JSON.stringify(parsed, null, 2) + "\n";
}

function normalizeVaultName(raw: string | undefined): string {
  const name = slugify(raw?.trim() || "vault");
  return name || "vault";
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function userScopeHookCommand(targetDir: string, vaultName: string, elegentBin: string): string {
  return `ELEGENT_ROOT=${shellQuote(targetDir)} ELEGENT_VAULT_NAME=${shellQuote(vaultName)} ${elegentBin}`;
}

function renderedFiles(targetDir: string, elegentBin: string, options: Required<BootstrapOptions>, vaultName: string): RenderedFile[] {
  const files: RenderedFile[] = ROOT_RENDERED_FILES.map((f) => ({ base: targetDir, ...f }));

  if (options.claudeScope !== "none") {
    const user = options.claudeScope === "user";
    const base = user ? options.claudeUserDir : targetDir;
    const hookCommand = user ? userScopeHookCommand(targetDir, vaultName, elegentBin) : elegentBin;
    const bashAllow = user ? `ELEGENT_ROOT=* ${elegentBin}` : elegentBin;
    files.push(
      { base, rel: "settings.json", template: "settings-json", hookCommand, bashAllow },
      { base, rel: "skills/digest/SKILL.md", template: "skill-digest" },
    );
  }

  if (options.codexScope !== "none") {
    const user = options.codexScope === "user";
    const base = user ? options.codexUserDir : targetDir;
    const hookCommand = user ? userScopeHookCommand(targetDir, vaultName, elegentBin) : elegentBin;
    files.push({ base, rel: user ? "hooks.json" : ".codex/hooks.json", template: "codex-hooks", hookCommand });
    files.push({ base, rel: user ? "skills/digest/SKILL.md" : ".codex/skills/digest/SKILL.md", template: "skill-digest" });
  }

  if (options.claudeScope === "project") {
    for (const file of files) {
      if (file.rel === "settings.json") file.rel = ".claude/settings.json";
      if (file.rel === "skills/digest/SKILL.md") file.rel = ".claude/skills/digest/SKILL.md";
    }
  }

  return files;
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
  git: GitRunner,
  targetDir: string,
  elegentBin: string,
  options: BootstrapOptions = {},
): BootstrapResult {
  const created: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];
  const vaultName = normalizeVaultName(options.vaultName);
  const resolvedOptions: Required<BootstrapOptions> = {
    vaultName,
    claudeScope: options.claudeScope ?? "project",
    codexScope: options.codexScope ?? "project",
    claudeUserDir: options.claudeUserDir ?? join(targetDir, ".claude"),
    codexUserDir: options.codexUserDir ?? join(targetDir, ".codex"),
  };

  store.mkdirp(targetDir);
  created.push(...scaffoldVault(store, join(targetDir, vaultName)));
  // scaffoldVault 手寫的 index.md 只在根目錄，指向的五個子目錄 index.md（projects/areas/
  // resources/archives/palace）尚不存在——首次 lint 會報 5 個 broken-link 警告。這裡立刻
  // 補生成，讓 init 首跑就是 0 warnings。
  regenerateIndexes(store, join(targetDir, vaultName));

  for (const { base, rel, template, hookCommand, bashAllow } of renderedFiles(targetDir, elegentBin, resolvedOptions, vaultName)) {
    const p = join(base, rel);
    if (store.exists(p)) {
      skipped.push(p);
      continue;
    }
    let content = renderTemplate(template, {
      ELEGENT_BIN: elegentBin,
      ELEGENT_HOOK_COMMAND: hookCommand,
      ELEGENT_BASH_ALLOW: bashAllow,
    });
    if (template === "mcp-json") content = normalizeMcpJson(content, join(targetDir, vaultName));
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
      const initResult = git.init(targetDir);
      if (!initResult.ok) {
        warnings.push(`git init 失敗：${initResult.detail}`);
      } else {
        // 初始 commit：讓 init 完成時已有一個乾淨的起點可 diff。commit 失敗最常見的原因是
        // git identity 未設定——不代為設定（不動使用者的 git config），只警告、不中斷。
        const addResult = git.stageAll(targetDir);
        if (!addResult.ok) {
          warnings.push(`git add 失敗：${addResult.detail}`);
        } else {
          const commitResult = git.commit(targetDir, "init: EleGent 記憶系統初始化");
          if (!commitResult.ok) {
            warnings.push(`git commit 失敗，可能是 git identity 未設定——請執行 git config user.name / user.email 後自行 commit：${commitResult.detail}`);
          }
        }
      }
    } catch (err) {
      warnings.push(`git 不可用，略過 git init：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { created, skipped, warnings };
}
