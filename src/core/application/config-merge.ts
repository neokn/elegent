/**
 * 冪等加值式合併 agent CLI 的 hooks 設定：existing=null 產全新檔；否則保留既有內容，
 * 只補上缺的 hook 條目（以 command 字串去重）與 permissions.allow 項。只增不改不刪。
 * JSON parse 失敗直接 throw——呼叫端負責 catch 後保留原檔並發警告（不覆寫使用者設定）。
 */

const CLAUDE_EVENTS = ["Stop", "PreCompact", "SessionEnd", "SessionStart"] as const;
const CODEX_EVENTS = ["Stop", "PreCompact"] as const;

interface HookEntry { type: "command"; command: string; [k: string]: unknown; }
interface HookGroup { hooks?: HookEntry[]; [k: string]: unknown; }
interface Settings { hooks?: Record<string, HookGroup[]>; permissions?: { allow?: string[]; [k: string]: unknown }; [k: string]: unknown; }

interface AgyServerEntry { enabled?: boolean; PostInvocation?: HookEntry[]; [k: string]: unknown; }
interface AgyRoot { [server: string]: AgyServerEntry }

interface McpServerEntry { command: string; args: string[]; env?: Record<string, string>; [k: string]: unknown; }
interface McpConfigRoot { mcpServers?: Record<string, McpServerEntry>; [k: string]: unknown; }

/** elegentBin 拆段：兩段（開發模式 `bun /abs/elgt.ts`）第一段當 command、其餘接進 args 前面；單段原樣當 command。 */
function splitElegentBin(elegentBin: string): { command: string; args: string[] } {
  const parts = elegentBin.split(" ").filter(Boolean);
  const [command, ...rest] = parts;
  return { command, args: [...rest, "mcp"] };
}

function ensureHook(hooks: Record<string, HookGroup[]>, event: string, entry: HookEntry): void {
  const groups = (hooks[event] ??= []);
  const present = groups.some((g) => (g.hooks ?? []).some((h) => h.command === entry.command));
  if (!present) groups.push({ hooks: [entry] });
}

export function mergeClaudeSettings(existing: string | null, opts: { hookCommand: string; bashAllow: string }): string {
  const root: Settings = existing ? JSON.parse(existing) : {};
  root.hooks ??= {};
  for (const event of CLAUDE_EVENTS) {
    ensureHook(root.hooks, event, { type: "command", command: `${opts.hookCommand} hook claude ${event.toLowerCase()}` });
  }
  root.permissions ??= {};
  (root.permissions.allow ??= []);
  const allow = `Bash(${opts.bashAllow}:*)`;
  if (!root.permissions.allow.includes(allow)) root.permissions.allow.push(allow);
  return JSON.stringify(root, null, 2) + "\n";
}

export function mergeCodexHooks(existing: string | null, opts: { hookCommand: string }): string {
  const root: Settings = existing ? JSON.parse(existing) : {};
  root.hooks ??= {};
  for (const event of CODEX_EVENTS) {
    ensureHook(root.hooks, event, {
      type: "command",
      command: `${opts.hookCommand} hook codex ${event.toLowerCase()}`,
      statusMessage: "Archiving Codex conversation to EleGent",
      timeout: 30,
    });
  }
  return JSON.stringify(root, null, 2) + "\n";
}

export function mergeAgyHooks(existing: string | null, opts: { hookCommand: string }): string {
  const root: AgyRoot = existing ? JSON.parse(existing) : {};
  const server = (root["elegent-memory"] ??= {});
  server.enabled ??= true;
  server.PostInvocation ??= [];
  const command = `${opts.hookCommand} hook agy postinvocation`;
  const present = server.PostInvocation.some((h) => h.command === command);
  if (!present) server.PostInvocation.push({ type: "command", command });
  return JSON.stringify(root, null, 2) + "\n";
}

/**
 * agy（Antigravity）MCP 設定：`~/.gemini/config/mcp_config.json`，標準
 * `{ mcpServers: {...} }` 形狀。SET（非只增）`elegent-memory` 這個 key——
 * 值以 elegentBin/vaultRoot 決定性算出，重跑會設回同一個值，天生冪等；
 * 其餘既有 server 條目與其他 top-level 欄位原樣保留。
 */
export function mergeAgyMcpConfig(existing: string | null, elegentBin: string, vaultRoot: string): string {
  const root: McpConfigRoot = existing ? JSON.parse(existing) : {};
  root.mcpServers ??= {};
  const { command, args } = splitElegentBin(elegentBin);
  root.mcpServers["elegent-memory"] = { command, args, env: { ELEGENT_VAULT: vaultRoot } };
  return JSON.stringify(root, null, 2) + "\n";
}
