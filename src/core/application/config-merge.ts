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
