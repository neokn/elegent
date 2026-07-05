import { resolve, basename } from "node:path";

export function sanitizeSessionId(raw: string): string | null {
  return /^[A-Za-z0-9_-]{1,128}$/.test(raw) ? raw : null;
}

export function validateTranscriptPath(p: string): string | null {
  if (!p) return null;
  const r = resolve(p);
  if (!/\.(jsonl|json)$/.test(r)) return null;
  if (r.split("/").includes("..")) return null;
  return r;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function deriveProjectSlug(jsonlText: string): string | null {
  const lines = jsonlText.split("\n").slice(0, 200);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (typeof entry.cwd === "string" && entry.cwd.length > 0) {
        const slug = slugify(basename(entry.cwd));
        return slug || null;
      }
    } catch {
      continue;
    }
  }
  return null;
}
