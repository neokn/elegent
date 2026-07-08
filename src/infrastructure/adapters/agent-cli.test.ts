import { expect, test } from "bun:test";
import { claudeMcpAddArgs, codexMcpAddArgs } from "@infrastructure/adapters/agent-cli";

const base = { scope: "user" as const, vaultRoot: "/v", cwd: "/c" };

test("claude：scope 在 name 前、env 在 name 後，-- 後接 bin 與 mcp（單段 bin）", () => {
  expect(claudeMcpAddArgs({ ...base, elegentBin: "/bin/elgt" })).toEqual([
    "mcp", "add", "--scope", "user", "elegent-memory", "--env", "ELEGENT_VAULT=/v",
    "--", "/bin/elgt", "mcp",
  ]);
});

test("claude：兩段 bin（bun /abs/elgt.ts）正確拆到 -- 之後", () => {
  expect(claudeMcpAddArgs({ ...base, scope: "local", elegentBin: "bun /abs/elgt.ts" })).toEqual([
    "mcp", "add", "--scope", "local", "elegent-memory", "--env", "ELEGENT_VAULT=/v",
    "--", "bun", "/abs/elgt.ts", "mcp",
  ]);
});

test("codex：name 在 flag 前，-- 後接 bin 與 mcp", () => {
  expect(codexMcpAddArgs({ ...base, elegentBin: "/bin/elgt" })).toEqual([
    "mcp", "add", "elegent-memory", "--env", "ELEGENT_VAULT=/v",
    "--", "/bin/elgt", "mcp",
  ]);
});
