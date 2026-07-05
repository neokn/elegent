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

export function stripNoise(text: string): string {
  let out = text;
  for (const tag of TAGS) {
    // 錨定行首的成對標籤（可跨行、非貪婪）
    out = out.replace(new RegExp(`^<${tag}>[\\s\\S]*?</${tag}>\\n?`, "gm"), "");
    // 錨定行首的單行自閉/殘缺標籤行
    out = out.replace(new RegExp(`^<${tag}[^>]*>.*$\\n?`, "gm"), "");
  }
  return out;
}
