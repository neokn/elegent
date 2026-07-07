import { emit, vaultRoot, repoRoot, readStdinJson } from "../lib/hookio";
import { buildWakeBundle, WAKE_MAX_CHARS } from "../lib/wake";
import { logHookError } from "../lib/state";

const WRAP_OPEN = "<memory-wake>\n";
const WRAP_CLOSE = "\n</memory-wake>";

export function buildSessionStartOutput(bundle: { text: string; chars: number; withinBudget: boolean }): object {
  const budget = WAKE_MAX_CHARS - WRAP_OPEN.length - WRAP_CLOSE.length;
  const text = bundle.text.slice(0, budget);
  if (!text) return {};
  return { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: `${WRAP_OPEN}${text}${WRAP_CLOSE}` } };
}

/**
 * `bun tools/hooks/sessionstart.ts` 與 `elgt hook sessionstart` 共用的入口邏輯；恆回 0。
 * argv 目前未使用（sessionstart hook 只讀 stdin），保留參數與其他入口函式簽章一致。
 */
export async function runSessionStartEntry(argv?: string[]): Promise<number> {
  try {
    await readStdinJson(); // 消化 stdin，內容不需使用
    const b = buildWakeBundle(vaultRoot());
    if (!b.withinBudget) logHookError(repoRoot(), "sessionstart", new Error(`wake 超預算: ${b.chars} > ${WAKE_MAX_CHARS}`));
    emit(buildSessionStartOutput(b));
  } catch (err) {
    try { logHookError(repoRoot(), "sessionstart", err); } catch {}
    emit({});
  }
  return 0;
}

if (import.meta.main) {
  process.exit(await runSessionStartEntry(process.argv.slice(2)));
}
