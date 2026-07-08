import type { McpRegisterOpts, McpRegistrar } from "@core/ports";

/**
 * McpRegistrar 的 Bun.spawnSync 實作（secondary adapter）：shell 出去呼叫官方
 * `claude`／`codex` CLI 的 `mcp add` 子指令註冊 elegent-memory server。純 arg 組裝邏輯
 * 拆成 `claudeMcpAddArgs`／`codexMcpAddArgs` 兩支純函式，供單測不必真的呼叫 CLI。
 */

const SERVER = "elegent-memory";
const binParts = (bin: string): string[] => bin.split(" ").filter(Boolean);

/** claude mcp add：scope 可在 name 前；env 需在 server name 後，-- 之後為 stdio 指令。 */
export function claudeMcpAddArgs(opts: McpRegisterOpts): string[] {
  return [
    "mcp", "add", "--scope", opts.scope, SERVER, "--env", `ELEGENT_VAULT=${opts.vaultRoot}`,
    "--", ...binParts(opts.elegentBin), "mcp",
  ];
}

/** codex mcp add：name 在前，--env 次之，-- 之後為 stdio 指令（Codex 無 scope flag，一律寫 user config）。 */
export function codexMcpAddArgs(opts: McpRegisterOpts): string[] {
  return [
    "mcp", "add", SERVER, "--env", `ELEGENT_VAULT=${opts.vaultRoot}`,
    "--", ...binParts(opts.elegentBin), "mcp",
  ];
}

function run(cmd: string, args: string[], cwd: string): { ok: boolean; detail: string } {
  try {
    const r = Bun.spawnSync([cmd, ...args], { cwd, env: process.env });
    const stderr = r.stderr?.toString() ?? "";
    // 已存在視為成功（冪等）。
    if (r.exitCode !== 0 && /already exist/i.test(stderr)) return { ok: true, detail: "already registered" };
    return { ok: r.exitCode === 0, detail: stderr.trim() || `exit ${r.exitCode}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function serverListed(cmd: string): boolean {
  try {
    const r = Bun.spawnSync([cmd, "mcp", "get", SERVER], { env: process.env });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

export const agentCliRegistrar: McpRegistrar = {
  claudeUserServerExists: () => serverListed("claude"),
  codexUserServerExists: () => serverListed("codex"),
  registerClaude: (opts) => run("claude", claudeMcpAddArgs(opts), opts.cwd),
  registerCodex: (opts) => run("codex", codexMcpAddArgs(opts), opts.cwd),
};
