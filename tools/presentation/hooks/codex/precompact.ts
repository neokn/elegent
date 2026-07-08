import { runCodexHookEntry } from "./hook";

// Codex PreCompact hook 的獨立進入點（對齊 claude/precompact.ts 的形狀）。共用邏輯在 ./hook.ts。
if (import.meta.main) {
  process.exit(await runCodexHookEntry(["precompact"]));
}
