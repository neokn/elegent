import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgyArchiveHook } from "./hook";

function transcriptJsonl(messages: number): string {
  const lines = [];
  for (let i = 0; i < messages; i++) {
    lines.push(
      JSON.stringify({
        step_index: i,
        source: "USER_EXPLICIT",
        type: "USER_INPUT",
        created_at: "2026-07-08T10:00:00Z",
        content: `訊息 ${i}`,
      }),
    );
  }
  return lines.join("\n") + "\n";
}

/** 找 conversations 底下第一個非 index.md 的歸檔檔（不管巢狀在哪個 project slug 底下）。 */
function findArchivedMd(dir: string): string | null {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findArchivedMd(full);
      if (found) return found;
    } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "index.md") {
      return full;
    }
  }
  return null;
}

function withElegentRoot<T>(root: string, fn: () => T): T {
  const prev = process.env.ELEGENT_ROOT;
  process.env.ELEGENT_ROOT = root;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.ELEGENT_ROOT;
    else process.env.ELEGENT_ROOT = prev;
  }
}

test("runAgyArchiveHook：postinvocation 首次呼叫會歸檔", () => {
  const root = mkdtempSync(join(tmpdir(), "agy-hook-post-"));
  const transcriptPath = join(root, "transcript.jsonl");
  writeFileSync(transcriptPath, transcriptJsonl(1));

  withElegentRoot(root, () => {
    runAgyArchiveHook({ conversationId: "session-1", transcriptPath }, "postinvocation");
  });

  const convDir = join(root, "vault/pensieve/ankipan/conversations");
  expect(findArchivedMd(convDir)).not.toBeNull();
});

test("runAgyArchiveHook：訊息數未增加時節流，不重複歸檔", () => {
  const root = mkdtempSync(join(tmpdir(), "agy-hook-throttle-"));
  const transcriptPath = join(root, "transcript.jsonl");
  writeFileSync(transcriptPath, transcriptJsonl(1));

  withElegentRoot(root, () => {
    runAgyArchiveHook({ conversationId: "session-2", transcriptPath }, "postinvocation");
    const convDir = join(root, "vault/pensieve/ankipan/conversations");
    const firstArchive = findArchivedMd(convDir)!;
    const before = readdirSync(join(convDir), { recursive: true } as any).length;

    // 訊息數沒變，再呼叫一次應該被節流，不新增檔案。
    runAgyArchiveHook({ conversationId: "session-2", transcriptPath }, "postinvocation");
    const after = readdirSync(join(convDir), { recursive: true } as any).length;
    expect(after).toBe(before);
    expect(existsSync(firstArchive)).toBe(true);
  });
});

test("runAgyArchiveHook：\"stop\" 與 \"postinvocation\" 目前行為一致（皆用訊息數節流，無 Codex 式的無條件旁路）", () => {
  const rootPost = mkdtempSync(join(tmpdir(), "agy-hook-mode-post-"));
  const rootStop = mkdtempSync(join(tmpdir(), "agy-hook-mode-stop-"));
  const transcriptPost = join(rootPost, "transcript.jsonl");
  const transcriptStop = join(rootStop, "transcript.jsonl");
  writeFileSync(transcriptPost, transcriptJsonl(1));
  writeFileSync(transcriptStop, transcriptJsonl(1));

  withElegentRoot(rootPost, () => {
    runAgyArchiveHook({ conversationId: "session-3", transcriptPath: transcriptPost }, "postinvocation");
  });
  withElegentRoot(rootStop, () => {
    runAgyArchiveHook({ conversationId: "session-3", transcriptPath: transcriptStop }, "stop");
  });

  expect(findArchivedMd(join(rootPost, "vault/pensieve/ankipan/conversations"))).not.toBeNull();
  expect(findArchivedMd(join(rootStop, "vault/pensieve/ankipan/conversations"))).not.toBeNull();
});

test("runAgyArchiveHook：缺 conversationId 或 transcriptPath 時安全跳過（回空物件、不 throw）", () => {
  const root = mkdtempSync(join(tmpdir(), "agy-hook-missing-"));
  withElegentRoot(root, () => {
    expect(runAgyArchiveHook({}, "postinvocation")).toEqual({});
  });
});
