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

if (import.meta.main) {
  try {
    await readStdinJson(); // 消化 stdin，內容不需使用
    const b = buildWakeBundle(vaultRoot());
    if (!b.withinBudget) logHookError(repoRoot(), "sessionstart", new Error(`wake 超預算: ${b.chars} > ${WAKE_MAX_CHARS}`));
    emit(buildSessionStartOutput(b));
  } catch (err) {
    try { logHookError(repoRoot(), "sessionstart", err); } catch {}
    emit({});
  }
}
