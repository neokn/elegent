import { join } from "node:path";

export async function readStdinJson(): Promise<any> {
  try {
    const text = await Bun.stdin.text();
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function emit(obj: unknown): void {
  console.log(JSON.stringify(obj));
}

export function repoRoot(): string {
  if (process.env.ELEGENT_ROOT) return process.env.ELEGENT_ROOT;
  return process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
}

export function vaultRoot(): string {
  return join(repoRoot(), process.env.ELEGENT_VAULT_NAME || "vault");
}
