import { join } from "node:path";

export async function readStdinJson(): Promise<any> {
  const text = await Bun.stdin.text();
  try { return JSON.parse(text); } catch { return {}; }
}

export function emit(obj: unknown): void {
  console.log(JSON.stringify(obj));
}

export function repoRoot(): string {
  return process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
}

export function vaultRoot(): string {
  return join(repoRoot(), "vault");
}
