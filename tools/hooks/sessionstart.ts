import { emit, vaultRoot, repoRoot, readStdinJson } from "../lib/hookio";
import { buildWakeBundle, WAKE_MAX_CHARS } from "../lib/wake";
import { logHookError } from "../lib/state";

if (import.meta.main) {
  try {
    await readStdinJson(); // 消化 stdin，內容不需使用
    const b = buildWakeBundle(vaultRoot());
    if (!b.withinBudget) logHookError(repoRoot(), "sessionstart", new Error(`wake 超預算: ${b.chars} > ${WAKE_MAX_CHARS}`));
    const text = b.text.slice(0, WAKE_MAX_CHARS);
    if (!text) emit({});
    else emit({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: `<memory-wake>\n${text}\n</memory-wake>` } });
  } catch (err) {
    try { logHookError(repoRoot(), "sessionstart", err); } catch {}
    emit({});
  }
}
