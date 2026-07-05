const TAGS = [
  "system-reminder",
  "command-message",
  "command-name",
  "command-args",
  "local-command-stdout",
  "local-command-caveat",
  "user-prompt-submit-hook",
  "hook_output",
  "task-notification",
];

// 錨定行首的成對標籤（開標籤可帶屬性；可跨行、非貪婪）。
// 標籤名後必須緊接 `>` 或空白，避免前綴撞名（如 <command-name-log>）。
const PAIRED_PATTERNS = TAGS.map(
  (tag) => new RegExp(`^<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>\\n?`, "gm"),
);

// 錨定行首的單行自閉/殘缺標籤行。
// 標籤名後必須緊接 `>`、`/` 或空白，避免前綴撞名。
const SINGLE_LINE_PATTERNS = TAGS.map(
  (tag) => new RegExp(`^<${tag}(?:[\\s/][^>]*)?>.*$\\n?`, "gm"),
);

export function stripNoise(text: string): string {
  let out = text;
  for (const re of PAIRED_PATTERNS) out = out.replace(re, "");
  for (const re of SINGLE_LINE_PATTERNS) out = out.replace(re, "");
  return out;
}
