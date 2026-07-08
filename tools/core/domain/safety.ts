import { resolve } from "node:path";

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
