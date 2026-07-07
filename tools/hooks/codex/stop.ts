import { runCodexHookEntry } from "./hook";

// Codex Stop hook 的獨立進入點（對齊 claude/stop.ts 的形狀）。共用邏輯在 ./hook.ts。
if (import.meta.main) {
  process.exit(await runCodexHookEntry(["stop"]));
}
