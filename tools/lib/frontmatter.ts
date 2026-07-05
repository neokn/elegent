import { parse, stringify } from "yaml";

export const NOTE_TYPES = ["note", "moc", "entity", "raw-log", "wake", "daily"] as const;

const KEY_ORDER = ["type", "title", "description", "tags", "timestamp", "date", "aliases", "source", "user_managed"];

export function parseNote(text: string): { frontmatter: Record<string, unknown> | null; body: string } {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { frontmatter: null, body: text };
  let frontmatter: Record<string, unknown> | null = null;
  try {
    const parsed = parse(m[1]);
    frontmatter = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    frontmatter = null;
  }
  return { frontmatter, body: text.slice(m[0].length) };
}

export function serializeNote(fm: Record<string, unknown>, body: string): string {
  const ordered: Record<string, unknown> = {};
  for (const k of KEY_ORDER) if (k in fm) ordered[k] = fm[k];
  for (const k of Object.keys(fm)) if (!(k in ordered)) ordered[k] = fm[k];
  return `---\n${stringify(ordered).trimEnd()}\n---\n\n${body.replace(/^\n+/, "")}`;
}

export function validateFrontmatter(fm: Record<string, unknown> | null): string[] {
  if (!fm) return ["frontmatter 不可解析或缺失"];
  const errors: string[] = [];
  if (typeof fm.type !== "string" || fm.type.length === 0) errors.push("缺少必填欄位 type");
  else if (!(NOTE_TYPES as readonly string[]).includes(fm.type)) errors.push(`type "${fm.type}" 不在封閉詞彙表`);
  if (fm.tags !== undefined && !Array.isArray(fm.tags)) errors.push("tags 必須是 YAML list");
  if (fm.tags && Array.isArray(fm.tags) && fm.tags.some((t) => typeof t === "string" && (t.startsWith("#") || /^\d/.test(t)))) {
    errors.push("tag 不得帶 # 或以數字開頭");
  }
  return errors;
}
