import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readStdinJson } from "@presentation/hooks/hookio";
import { nodeFileStore } from "@infrastructure/adapters/node-fs";
import { nodeCodexSessionLocator } from "@infrastructure/adapters/codex-sessions";
import { readLastSave, writeLastSave, logHookError } from "@infrastructure/state";
import { regenerateIndexes } from "@core/application/indexgen";
import {
  archiveCodexTranscript,
  countCodexUserMessages,
  renderCodexTranscript,
  type RenderedCodexTranscript,
} from "@core/application/transcript/codex";

export type CodexHookMode = "stop" | "precompact";

export interface CodexHookDeps {
  findTranscript: (input: unknown, cwd: string) => { path: string; sessionId: string | null } | null;
  readTranscript: (path: string) => string;
  render: (jsonl: string, path: string) => RenderedCodexTranscript;
  countUser: (jsonl: string) => number;
  readLast: (root: string, sid: string) => number;
  writeLast: (root: string, sid: string, n: number) => void;
  archive: (path: string, rendered: RenderedCodexTranscript) => boolean;
  reindex: () => void;
  log: (hook: string, err: unknown) => void;
}

function currentGitRoot(): string {
  const git = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd: process.cwd() });
  if (git.exitCode === 0) {
    const root = git.stdout.toString().trim();
    if (root) return root;
  }
  return process.cwd();
}

function codexRepoRoot(): string {
  return process.env.ELEGENT_ROOT ?? currentGitRoot();
}

function codexVaultRoot(): string {
  return join(codexRepoRoot(), process.env.ELEGENT_VAULT_NAME || "vault");
}

export function runCodexArchiveHook(input: unknown, mode: CodexHookMode, d: CodexHookDeps): void {
  try {
    const root = codexRepoRoot();
    const found = d.findTranscript(input, currentGitRoot());
    if (!found) return;
    const text = d.readTranscript(found.path);
    const rendered = d.render(text, found.path);
    const sid = rendered.sessionId;
    if (!sid) return;
    const count = d.countUser(text);
    if (mode === "stop" && count <= d.readLast(root, sid)) return;
    const written = d.archive(found.path, rendered);
    d.writeLast(root, sid, count);
    if (written) {
      try {
        d.reindex();
      } catch (err) {
        try { d.log(`codex:${mode}:reindex`, err); } catch {}
      }
    }
  } catch (err) {
    try { d.log(`codex:${mode}`, err); } catch {}
  }
}

export async function runCodexHookEntry(argv: string[] = []): Promise<number> {
  const mode: CodexHookMode = argv[0] === "precompact" ? "precompact" : "stop";
  try {
    await readStdinJson().then((input) => {
      if (process.env.ELEGENT_HEADLESS_DISTIL === "1") return;
      runCodexArchiveHook(input, mode, {
        findTranscript: (hookInput, cwd) => nodeCodexSessionLocator.locate(hookInput, cwd),
        readTranscript: (p) => readFileSync(p, "utf8"),
        render: renderCodexTranscript,
        countUser: countCodexUserMessages,
        readLast: readLastSave,
        writeLast: writeLastSave,
        archive: (path, rendered) => archiveCodexTranscript(nodeFileStore, path, codexVaultRoot(), rendered).written,
        reindex: () => regenerateIndexes(nodeFileStore, codexVaultRoot()),
        log: (hook, err) => logHookError(codexRepoRoot(), hook, err),
      });
    });
  } catch (err) {
    try { logHookError(codexRepoRoot(), `codex:${mode}`, err); } catch {}
  }
  return 0;
}
