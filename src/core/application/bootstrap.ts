import { join } from "node:path";
import { mergeAgyHooks, mergeAgyMcpConfig, mergeClaudeSettings, mergeCodexHooks } from "@core/application/config-merge";
import { scaffoldVault } from "@core/application/scaffold";
import { renderCodexMcpToml, renderTemplate, type TemplateName } from "@core/application/templates";
import { deriveVaultMode, resolveVaultDir, vaultDirName } from "@core/application/vault-naming";
import { regenerateIndexes } from "@core/application/indexgen";
import type { FileStore, GitRunner, McpRegistrar } from "@core/ports";

export interface BootstrapResult {
  created: string[];
  skipped: string[];
  warnings: string[];
}

export type AgentConfigScope = "project" | "user" | "local" | "none";

export interface BootstrapOptions {
  vaultName?: string;
  claudeScope?: AgentConfigScope;
  codexScope?: AgentConfigScope;
  agyScope?: AgentConfigScope;
  claudeUserDir?: string;
  codexUserDir?: string;
  agyUserDir?: string;
}

interface RenderedFile {
  base: string;
  rel: string;
  template: TemplateName;
}

const ROOT_RENDERED_FILES: Array<{ rel: string; template: TemplateName }> = [
  { rel: ".gitignore", template: "gitignore" },
];

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

// user/project/local 皆嵌入絕對 targetDir + 實際 vault 目錄名，讓 hook 執行時不必依賴
// CLAUDE_PROJECT_DIR/cwd/git-root 等易受環境影響的偵測——尤其 project/local 的 vault
// 目錄名是依 basename 算出的 slug（如 `my-app.vault`），並非 hookio.ts 預設 fallback
// 的字面值 "vault"，沒有這個環境變數會讀到不存在的路徑。
function absoluteHookCommand(targetDir: string, vaultName: string, elegentBin: string): string {
  return `ELEGENT_ROOT=${shellQuote(targetDir)} ELEGENT_VAULT_NAME=${shellQuote(vaultName)} ${elegentBin}`;
}

function assertScopeCompatible(claude: AgentConfigScope, codex: AgentConfigScope, agy: AgentConfigScope): void {
  const scopes = [claude, codex, agy];
  const hasLocal = scopes.includes("local");
  const hasProjectOrUser = scopes.some((s) => s === "project" || s === "user");
  if (hasLocal && hasProjectOrUser) {
    throw new Error("scope 混用不合法：local 只能與 local 或 none 併用（不可與 project/user 混用）");
  }
}

// digest skill 一律走三家的「專案層」探索路徑（.claude/.codex/.agents）：
// user scope 以 vault 為專案根（要蒸餾就到 vault 底下啟動 agent CLI），
// project/local 以 targetDir 為專案根。不寫 user 層全域 skills 目錄——
// 全域 skill 會讓 /digest 在任何專案都可觸發，但 vault 路徑只在 init 目標有效。
// lint/reindex 都排除點字頭目錄，vault 內的 .claude/.codex/.agents 不會被當筆記掃到。
function renderedFiles(targetDir: string, vaultDir: string, options: Required<BootstrapOptions>): RenderedFile[] {
  const files: RenderedFile[] = ROOT_RENDERED_FILES.map((f) => ({ base: targetDir, ...f }));
  const skillBase = (scope: AgentConfigScope) => (scope === "user" ? vaultDir : targetDir);

  if (options.claudeScope !== "none") {
    files.push({ base: skillBase(options.claudeScope), rel: ".claude/skills/digest/SKILL.md", template: "skill-digest" });
  }
  if (options.codexScope !== "none") {
    files.push({ base: skillBase(options.codexScope), rel: ".codex/skills/digest/SKILL.md", template: "skill-digest" });
  }
  if (options.agyScope !== "none") {
    files.push({ base: skillBase(options.agyScope), rel: ".agents/skills/digest/SKILL.md", template: "skill-digest" });
  }

  return files;
}

function mergeWrite(
  store: FileStore,
  path: string,
  merge: (existing: string | null) => string,
  warnings: string[],
  created: string[],
  label: string,
): void {
  try {
    const existing = store.tryRead(path);
    const content = merge(existing);
    store.write(path, content);
    if (existing === null) created.push(path);
  } catch (err) {
    warnings.push(`合併 ${label} 失敗，保留原檔：${err instanceof Error ? err.message : String(err)}`);
  }
}

function ensureGitignoreLine(store: FileStore, targetDir: string, line: string, created: string[]): void {
  const p = join(targetDir, ".gitignore");
  const existing = store.tryRead(p);
  const lines = existing ? existing.split("\n") : [];
  if (lines.includes(line)) return;
  const next = (existing && !existing.endsWith("\n") ? existing + "\n" : existing ?? "") + line + "\n";
  if (existing === null) created.push(p);
  store.write(p, next);
}

function appendCodexMcpToml(store: FileStore, path: string, elegentBin: string, vaultDir: string, created: string[]): void {
  const existing = store.tryRead(path);
  if (existing?.includes("[mcp_servers.elegent-memory]")) return;
  const block = renderCodexMcpToml(elegentBin, vaultDir);
  if (existing === null) created.push(path);
  store.write(path, existing ? existing.replace(/\n*$/, "\n\n") + block : block);
}

/**
 * 在（通常是空的）資料夾裡一鍵建立完整記憶系統：
 *   1. `mkdirSync(targetDir)` + `scaffoldVault(vaultDir)`（冪等不覆寫）
 *   2. 從內嵌模板寫入 skill/gitignore，hooks/MCP 設定走冪等 merge/registration
 *   3. 非 git repo → `git init -b main`（git 不可用/失敗只警告，不中斷、不 throw）
 *   4. 回傳 `{ created, skipped, warnings }`；呼叫端（elgt init）據此印出下一步指引
 *
 * 全程冪等：對同一個 targetDir 重複呼叫，第二次之後 created 應為空、既有檔內容不變。
 */
export function bootstrap(
  store: FileStore,
  git: GitRunner,
  registrar: McpRegistrar,
  targetDir: string,
  elegentBin: string,
  options: BootstrapOptions = {},
): BootstrapResult {
  const created: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];
  const resolvedOptions: Required<BootstrapOptions> = {
    vaultName: options.vaultName ?? "vault",
    claudeScope: options.claudeScope ?? "user",
    codexScope: options.codexScope ?? "user",
    agyScope: options.agyScope ?? "user",
    claudeUserDir: options.claudeUserDir ?? join(targetDir, ".claude"),
    codexUserDir: options.codexUserDir ?? join(targetDir, ".codex"),
    agyUserDir: options.agyUserDir ?? join(targetDir, ".gemini/config"),
  };
  assertScopeCompatible(resolvedOptions.claudeScope, resolvedOptions.codexScope, resolvedOptions.agyScope);
  const mode = deriveVaultMode(resolvedOptions.claudeScope, resolvedOptions.codexScope, resolvedOptions.agyScope);
  const vaultName = vaultDirName(mode, targetDir, resolvedOptions.vaultName);
  const vaultDir = resolveVaultDir(mode, targetDir, resolvedOptions.vaultName);

  store.mkdirp(targetDir);
  created.push(...scaffoldVault(store, vaultDir));
  // scaffoldVault 手寫的 index.md 只在根目錄，指向的五個子目錄 index.md（projects/areas/
  // resources/archives/palace）尚不存在——首次 lint 會報 5 個 broken-link 警告。這裡立刻
  // 補生成，讓 init 首跑就是 0 warnings。
  regenerateIndexes(store, vaultDir);

  for (const { base, rel, template } of renderedFiles(targetDir, vaultDir, resolvedOptions)) {
    const p = join(base, rel);
    if (store.exists(p)) {
      skipped.push(p);
      continue;
    }
    let content = renderTemplate(template, {
      ELEGENT_BIN: elegentBin,
    });
    store.write(p, content);
    created.push(p);
  }

  const hookCommand = absoluteHookCommand(targetDir, vaultName, elegentBin);
  const bashAllow = `ELEGENT_ROOT=* ${elegentBin}`;

  if (resolvedOptions.claudeScope !== "none") {
    const base = resolvedOptions.claudeScope === "user" ? resolvedOptions.claudeUserDir : targetDir;
    const rel = resolvedOptions.claudeScope === "local" ? ".claude/settings.local.json" : resolvedOptions.claudeScope === "project" ? ".claude/settings.json" : "settings.json";
    mergeWrite(
      store,
      join(base, rel),
      (existing) => mergeClaudeSettings(existing, { hookCommand, bashAllow }),
      warnings,
      created,
      "Claude settings",
    );
  }

  if (resolvedOptions.codexScope !== "none") {
    const user = resolvedOptions.codexScope === "user";
    mergeWrite(
      store,
      join(user ? resolvedOptions.codexUserDir : targetDir, user ? "hooks.json" : ".codex/hooks.json"),
      (existing) => mergeCodexHooks(existing, { hookCommand }),
      warnings,
      created,
      "Codex hooks",
    );
  }

  if (resolvedOptions.agyScope !== "none") {
    const user = resolvedOptions.agyScope === "user";
    mergeWrite(
      store,
      join(user ? resolvedOptions.agyUserDir : targetDir, user ? "hooks.json" : ".agents/hooks.json"),
      (existing) => mergeAgyHooks(existing, { hookCommand }),
      warnings,
      created,
      "Antigravity hooks",
    );
  }

  if (mode === "local") {
    ensureGitignoreLine(store, targetDir, `${vaultName}/`, created);
  }

  if (resolvedOptions.claudeScope !== "none") {
    const scope = resolvedOptions.claudeScope;
    const skip = (scope === "local" || scope === "project") && registrar.claudeUserServerExists();
    if (!skip) {
      const r = registrar.registerClaude({ scope, vaultRoot: vaultDir, elegentBin, cwd: targetDir });
      if (!r.ok) warnings.push(`Claude MCP 註冊失敗（可手動 claude mcp add）：${r.detail}`);
    }
  }

  if (resolvedOptions.codexScope !== "none") {
    const scope = resolvedOptions.codexScope;
    if (scope === "user") {
      const r = registrar.registerCodex({ scope, vaultRoot: vaultDir, elegentBin, cwd: targetDir });
      if (!r.ok) warnings.push(`Codex MCP 註冊失敗（可手動 codex mcp add）：${r.detail}`);
    } else if (!registrar.codexUserServerExists()) {
      appendCodexMcpToml(store, join(targetDir, ".codex/config.toml"), elegentBin, vaultDir, created);
    }
  }

  if (resolvedOptions.agyScope === "user") {
    mergeWrite(
      store,
      join(resolvedOptions.agyUserDir, "mcp_config.json"),
      (existing) => mergeAgyMcpConfig(existing, elegentBin, vaultDir),
      warnings,
      created,
      "Antigravity MCP",
    );
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
