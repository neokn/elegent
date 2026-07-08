import { expect, test } from "bun:test";
import { mergeAgyHooks, mergeAgyMcpConfig, mergeClaudeSettings, mergeCodexHooks } from "@core/application/config-merge";

const CLAUDE = { hookCommand: "/bin/elgt", bashAllow: "/bin/elgt" };

test("Claude：空輸入 → 四事件齊全 + permissions.allow", () => {
  const out = JSON.parse(mergeClaudeSettings(null, CLAUDE));
  expect(Object.keys(out.hooks).sort()).toEqual(["PreCompact", "SessionEnd", "SessionStart", "Stop"].sort());
  expect(out.hooks.Stop[0].hooks[0].command).toBe("/bin/elgt hook claude stop");
  expect(out.permissions.allow).toContain("Bash(/bin/elgt:*)");
});

test("Claude：既有他人 hook 與設定被保留，我方條目加上", () => {
  const existing = JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: "command", command: "other-tool" }] }] },
    permissions: { allow: ["Bash(git:*)"] },
    model: "sonnet",
  });
  const out = JSON.parse(mergeClaudeSettings(existing, CLAUDE));
  expect(out.model).toBe("sonnet");
  expect(out.permissions.allow).toEqual(["Bash(git:*)", "Bash(/bin/elgt:*)"]);
  const cmds = out.hooks.Stop.flatMap((g: any) => g.hooks.map((h: any) => h.command));
  expect(cmds).toContain("other-tool");
  expect(cmds).toContain("/bin/elgt hook claude stop");
});

test("Claude：重跑冪等——第二次不重複加", () => {
  const once = mergeClaudeSettings(null, CLAUDE);
  const twice = mergeClaudeSettings(once, CLAUDE);
  expect(twice).toBe(once);
});

test("Claude：壞 JSON → throw", () => {
  expect(() => mergeClaudeSettings("{not json", CLAUDE)).toThrow();
});

test("Codex：空輸入 → Stop/PreCompact 齊全、含 statusMessage/timeout", () => {
  const out = JSON.parse(mergeCodexHooks(null, { hookCommand: "/bin/elgt" }));
  expect(Object.keys(out.hooks).sort()).toEqual(["PreCompact", "Stop"].sort());
  expect(out.hooks.Stop[0].hooks[0].command).toBe("/bin/elgt hook codex stop");
  expect(out.hooks.Stop[0].hooks[0].timeout).toBe(30);
});

test("Codex：重跑冪等", () => {
  const once = mergeCodexHooks(null, { hookCommand: "/bin/elgt" });
  expect(mergeCodexHooks(once, { hookCommand: "/bin/elgt" })).toBe(once);
});

test("Codex：壞 JSON → throw", () => {
  expect(() => mergeCodexHooks("{not json", { hookCommand: "/bin/elgt" })).toThrow();
});

const AGY = { hookCommand: "/bin/elgt" };

test("agy：空輸入 → 產生 elegent-memory + enabled + PostInvocation", () => {
  const out = JSON.parse(mergeAgyHooks(null, AGY));
  expect(out["elegent-memory"].enabled).toBe(true);
  expect(out["elegent-memory"].PostInvocation).toEqual([
    { type: "command", command: "/bin/elgt hook agy postinvocation" },
  ]);
});

test("agy：保留既有其他 server 條目", () => {
  const existing = JSON.stringify({
    "other-server": { enabled: true, PostInvocation: [{ type: "command", command: "other-tool" }] },
  });
  const out = JSON.parse(mergeAgyHooks(existing, AGY));
  expect(out["other-server"]).toEqual({
    enabled: true,
    PostInvocation: [{ type: "command", command: "other-tool" }],
  });
  expect(out["elegent-memory"].enabled).toBe(true);
  const cmds = out["elegent-memory"].PostInvocation.map((h: any) => h.command);
  expect(cmds).toContain("/bin/elgt hook agy postinvocation");
});

test("agy：既有 elegent-memory 缺 enabled → 補上 true，不覆寫其他欄位", () => {
  const existing = JSON.stringify({
    "elegent-memory": { PostInvocation: [] },
  });
  const out = JSON.parse(mergeAgyHooks(existing, AGY));
  expect(out["elegent-memory"].enabled).toBe(true);
  expect(out["elegent-memory"].PostInvocation).toEqual([
    { type: "command", command: "/bin/elgt hook agy postinvocation" },
  ]);
});

test("agy：重跑冪等——第二次不重複加", () => {
  const once = mergeAgyHooks(null, AGY);
  const twice = mergeAgyHooks(once, AGY);
  expect(twice).toBe(once);
});

test("agy：壞 JSON → throw", () => {
  expect(() => mergeAgyHooks("{not json", AGY)).toThrow();
});

test("agy MCP：空輸入 + 單段 bin → 產生 elegent-memory 標準形狀", () => {
  const out = JSON.parse(mergeAgyMcpConfig(null, "/bin/elgt", "/v"));
  expect(out.mcpServers["elegent-memory"]).toEqual({
    command: "/bin/elgt",
    args: ["mcp"],
    env: { ELEGENT_VAULT: "/v" },
  });
});

test("agy MCP：兩段 bin → command 拆出第一段、其餘接進 args", () => {
  const out = JSON.parse(mergeAgyMcpConfig(null, "bun /abs/elgt.ts", "/v"));
  expect(out.mcpServers["elegent-memory"]).toEqual({
    command: "bun",
    args: ["/abs/elgt.ts", "mcp"],
    env: { ELEGENT_VAULT: "/v" },
  });
});

test("agy MCP：保留既有其他 server 與其他 top-level 欄位", () => {
  const existing = JSON.stringify({
    mcpServers: { "other-server": { command: "other", args: [] } },
    someOtherKey: "kept",
  });
  const out = JSON.parse(mergeAgyMcpConfig(existing, "/bin/elgt", "/v"));
  expect(out.someOtherKey).toBe("kept");
  expect(out.mcpServers["other-server"]).toEqual({ command: "other", args: [] });
  expect(out.mcpServers["elegent-memory"]).toEqual({
    command: "/bin/elgt",
    args: ["mcp"],
    env: { ELEGENT_VAULT: "/v" },
  });
});

test("agy MCP：重跑冪等——第二次不變", () => {
  const once = mergeAgyMcpConfig(null, "/bin/elgt", "/v");
  const twice = mergeAgyMcpConfig(once, "/bin/elgt", "/v");
  expect(twice).toBe(once);
});

test("agy MCP：壞 JSON → throw", () => {
  expect(() => mergeAgyMcpConfig("{not json", "/bin/elgt", "/v")).toThrow();
});

test("agy MCP：elegentBin 為空白字串 → throw（而非靜默產生 command: undefined）", () => {
  expect(() => mergeAgyMcpConfig(null, "", "/v")).toThrow();
  expect(() => mergeAgyMcpConfig(null, "   ", "/v")).toThrow();
});
