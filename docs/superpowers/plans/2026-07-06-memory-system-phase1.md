# 記憶系統 Phase 1 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建成可日常使用的記憶系統核心：vault 骨架 + hooks 自動逐字歸檔 + wake 注入 + `/digest` 蒸餾 + lint/guard/backfill 工具鏈。

**Architecture:** 雙受眾 markdown vault（PARA 給人、`palace/` 給 LLM），OKF × Obsidian 雙相容格式。所有程式為確定性工具（無 LLM 呼叫）：Claude Code hooks 把對話 JSONL render 成合規 markdown 寫入 raw 層；蒸餾由 skill 文件驅動 LLM 完成。規格見 [設計文件](../specs/2026-07-06-memory-system-design.md)。

**Tech Stack:** Bun + TypeScript（唯一語言）、`bun:test`、`yaml` 套件、Claude Code hooks、obsidian-cli（skill 層使用，非程式依賴）。

## Global Constraints

- 程式碼一律 Bun + TypeScript；測試 `bun:test`，測試檔與模組同目錄（`*.test.ts`）
- `type` 封閉詞彙表：`note|moc|entity|raw-log|wake|daily`
- 內部連結一律標準 markdown 相對連結；禁 `[[wikilink]]`、`![[embed]]`
- Wake 注入預算：≤3600 字元（≈900 tokens）
- Stop hook 節流：`SAVE_INTERVAL = 15`（每 15 則 user 訊息歸檔一次）
- Hooks 絕不擋對話：任何錯誤 catch → stdout 輸出 `{}` → 錯誤寫 `.palace-state/hooks.log`
- `.palace-state/` 位於 repo 根，已在 `.gitignore`
- `vault/` 是 Obsidian vault 根 = OKF bundle；`index.md`/`log.md` 為 OKF 保留檔名（無 frontmatter，root index.md 例外可含 `okf_version`）
- raw 檔名確定性：`YYYY-MM-DD_<session_id>.md`（冪等覆寫）
- 文件內容一律 zh-Hant-TW；程式識別字英文

## 檔案結構總覽

```
package.json / tsconfig.json          # Task 1
tools/lib/frontmatter.ts              # Task 2  parse/serialize/validate
tools/lib/safety.ts                   # Task 3  sanitize/validate/slug
tools/lib/noise.ts                    # Task 4  雜訊剝除
tools/lib/render.ts                   # Task 5  JSONL → markdown
tools/cli/scaffold.ts                 # Task 6  vault 骨架（冪等）
tools/lib/archive.ts                  # Task 7  render → 寫入 raw 層
tools/lib/state.ts                    # Task 8  節流游標/訊息計數/錯誤日誌
tools/lib/hookio.ts                   # Task 9  stdin/stdout 共用
tools/hooks/stop.ts                   # Task 9
tools/hooks/precompact.ts             # Task 10
tools/hooks/sessionend.ts             # Task 11
tools/lib/wake.ts + tools/hooks/sessionstart.ts   # Task 12
.claude/settings.json                 # Task 13  hooks 註冊
tools/cli/backfill.ts                 # Task 14
tools/lib/indexgen.ts + tools/cli/reindex.ts      # Task 15
tools/lib/lint.ts + tools/cli/lint.ts             # Task 16
tools/lib/guard.ts + tools/cli/guard.ts           # Task 17
.claude/skills/digest/SKILL.md + CLAUDE.md        # Task 18
docs/superpowers/plans/…（本檔勾選）+ 驗收        # Task 19
```

---

### Task 1: Bun 工具鏈初始化

**Files:**
- Create: `package.json`, `tsconfig.json`, `tools/lib/smoke.test.ts`

**Interfaces:**
- Consumes: 無
- Produces: `bun test` 可執行；`yaml` 套件可 import

- [ ] **Step 1: 建立 package.json 與 tsconfig.json**

`package.json`:
```json
{
  "name": "llm-wiki",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test",
    "scaffold": "bun tools/cli/scaffold.ts",
    "reindex": "bun tools/cli/reindex.ts",
    "lint:vault": "bun tools/cli/lint.ts",
    "backfill": "bun tools/cli/backfill.ts"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["bun-types"],
    "noEmit": true
  },
  "include": ["tools/**/*.ts"]
}
```

- [ ] **Step 2: 安裝依賴**

Run: `bun add yaml && bun add -d bun-types`
Expected: `package.json` 出現 dependencies.yaml

- [ ] **Step 3: 寫 smoke test**

`tools/lib/smoke.test.ts`:
```ts
import { expect, test } from "bun:test";
import { parse } from "yaml";

test("toolchain works", () => {
  expect(parse("a: 1")).toEqual({ a: 1 });
});
```

- [ ] **Step 4: 執行測試**

Run: `bun test`
Expected: `1 pass`

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json bun.lock tools/
git commit -m "chore: Bun + TypeScript 工具鏈初始化"
```

---

### Task 2: frontmatter 模組

**Files:**
- Create: `tools/lib/frontmatter.ts`, `tools/lib/frontmatter.test.ts`

**Interfaces:**
- Consumes: `yaml` 的 `parse`/`stringify`
- Produces:
  - `NOTE_TYPES: readonly string[]`（六值詞彙表）
  - `parseNote(text: string): { frontmatter: Record<string, unknown> | null; body: string }`
  - `serializeNote(fm: Record<string, unknown>, body: string): string`（鍵序固定：type,title,description,tags,timestamp,date,aliases,source,user_managed,其餘）
  - `validateFrontmatter(fm: Record<string, unknown> | null): string[]`（錯誤訊息陣列；合法回 `[]`）

- [ ] **Step 1: 寫失敗測試**

`tools/lib/frontmatter.test.ts`:
```ts
import { expect, test } from "bun:test";
import { parseNote, serializeNote, validateFrontmatter, NOTE_TYPES } from "./frontmatter";

const doc = `---\ntype: entity\ntitle: 測試\ntags:\n  - person\n---\n\n# 內文\n`;

test("parseNote 拆出 frontmatter 與 body", () => {
  const { frontmatter, body } = parseNote(doc);
  expect(frontmatter?.type).toBe("entity");
  expect(body).toContain("# 內文");
});

test("parseNote 無 frontmatter 回 null", () => {
  expect(parseNote("# 純內文\n").frontmatter).toBeNull();
});

test("serializeNote 鍵序固定且可 round-trip", () => {
  const out = serializeNote({ tags: ["a"], type: "note", title: "T" }, "body\n");
  expect(out.indexOf("type:")).toBeLessThan(out.indexOf("title:"));
  expect(parseNote(out).frontmatter?.title).toBe("T");
});

test("validateFrontmatter 擋缺 type 與非法 type", () => {
  expect(validateFrontmatter(null)).not.toEqual([]);
  expect(validateFrontmatter({ type: "banana" })).not.toEqual([]);
  expect(validateFrontmatter({ type: "note" })).toEqual([]);
  expect(NOTE_TYPES).toContain("raw-log");
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `bun test tools/lib/frontmatter.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作**

`tools/lib/frontmatter.ts`:
```ts
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
```

- [ ] **Step 4: 執行確認通過**

Run: `bun test tools/lib/frontmatter.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add tools/lib/frontmatter.ts tools/lib/frontmatter.test.ts
git commit -m "feat: frontmatter 解析/序列化/驗證（type 封閉詞彙表）"
```

---

### Task 3: safety 模組（sanitize / slug / 專案推導）

**Files:**
- Create: `tools/lib/safety.ts`, `tools/lib/safety.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `sanitizeSessionId(raw: string): string | null`（僅 `[A-Za-z0-9_-]{1,128}`，否則 null）
  - `validateTranscriptPath(p: string): string | null`（resolve 後需 `.jsonl`/`.json` 結尾且不含 `..` 段；回 resolved path 或 null）
  - `slugify(name: string): string`（小寫、空白與 `_` → `-`、移除非 `[a-z0-9-]`、壓縮連續 `-`、去頭尾 `-`）
  - `deriveProjectSlug(jsonlText: string): string | null`（掃前 200 行，取第一個非空 `cwd` 的 basename 過 slugify）

- [ ] **Step 1: 寫失敗測試**

`tools/lib/safety.test.ts`:
```ts
import { expect, test } from "bun:test";
import { sanitizeSessionId, validateTranscriptPath, slugify, deriveProjectSlug } from "./safety";

test("sanitizeSessionId 擋路徑注入", () => {
  expect(sanitizeSessionId("abc-123_X")).toBe("abc-123_X");
  expect(sanitizeSessionId("../etc/passwd")).toBeNull();
  expect(sanitizeSessionId("")).toBeNull();
});

test("validateTranscriptPath 只收 jsonl/json 且拒 traversal", () => {
  expect(validateTranscriptPath("/tmp/a/session.jsonl")).toBe("/tmp/a/session.jsonl");
  expect(validateTranscriptPath("/tmp/../etc/x.jsonl")).toBe("/etc/x.jsonl"); // resolve 後無 .. 段即可
  expect(validateTranscriptPath("/tmp/evil.txt")).toBeNull();
});

test("slugify 正規化", () => {
  expect(slugify("My Project_Name!!")).toBe("my-project-name");
  expect(slugify("  --a--  ")).toBe("a");
});

test("deriveProjectSlug 讀第一個 cwd", () => {
  const jsonl = [
    JSON.stringify({ type: "user", cwd: "" }),
    JSON.stringify({ type: "user", cwd: "/Users/me/GitHub/neokn/llm-wiki" }),
  ].join("\n");
  expect(deriveProjectSlug(jsonl)).toBe("llm-wiki");
  expect(deriveProjectSlug("not json")).toBeNull();
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `bun test tools/lib/safety.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

`tools/lib/safety.ts`:
```ts
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
```

- [ ] **Step 4: 執行確認通過**

Run: `bun test tools/lib/safety.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/lib/safety.ts tools/lib/safety.test.ts
git commit -m "feat: safety 模組——session sanitize、路徑驗證、slug、專案推導"
```

---

### Task 4: 雜訊剝除模組

**Files:**
- Create: `tools/lib/noise.ts`, `tools/lib/noise.test.ts`

**Interfaces:**
- Consumes: 無
- Produces: `stripNoise(text: string): string`（移除 Claude Code 注入標籤與 UI chrome；使用者散文中提到標籤名不受影響——所有 pattern 錨定行首）

- [ ] **Step 1: 寫失敗測試**

`tools/lib/noise.test.ts`:
```ts
import { expect, test } from "bun:test";
import { stripNoise } from "./noise";

test("移除行首的注入標籤區塊", () => {
  const input = "正文一\n<system-reminder>\n內部提醒\n</system-reminder>\n正文二\n";
  const out = stripNoise(input);
  expect(out).toContain("正文一");
  expect(out).toContain("正文二");
  expect(out).not.toContain("內部提醒");
});

test("單行標籤與 command 標籤", () => {
  const input = "<command-name>/digest</command-name>\n<command-message>digest</command-message>\n嗨\n";
  expect(stripNoise(input).trim()).toBe("嗨");
});

test("散文中提到標籤不受影響", () => {
  const input = "我在討論 <system-reminder> 這個字串\n";
  expect(stripNoise(input)).toBe(input);
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `bun test tools/lib/noise.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

`tools/lib/noise.ts`:
```ts
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
```

- [ ] **Step 4: 執行確認通過**

Run: `bun test tools/lib/noise.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/lib/noise.ts tools/lib/noise.test.ts
git commit -m "feat: transcript 雜訊剝除（行首錨定，不誤傷散文）"
```

---

### Task 5: transcript render（JSONL → markdown）

**Files:**
- Create: `tools/lib/render.ts`, `tools/lib/render.test.ts`, `tools/fixtures/session.jsonl`

**Interfaces:**
- Consumes: `stripNoise`（Task 4）、`deriveProjectSlug`（Task 3）
- Produces:
  - `interface RenderedTranscript { markdown: string; sessionId: string; projectSlug: string | null; date: string; title: string }`
  - `renderTranscript(jsonlText: string, sessionId: string): RenderedTranscript`
  - 規則：user/assistant 文字**逐字**；`tool_use` 壓成 `> 🔧 Name(摘要≤120字)`；`tool_result` 截頭尾各 20 行；tool_result-only 的 user 訊息併入前一則 assistant；date 取第一筆 `timestamp` 的 `YYYY-MM-DD`（缺則今天）；title 取第一則 user 文字前 60 字元

- [ ] **Step 1: 建立 fixture**

`tools/fixtures/session.jsonl`（每行一個 JSON，無縮排）:
```
{"type":"user","cwd":"/Users/me/GitHub/neokn/llm-wiki","timestamp":"2026-07-06T10:00:00Z","message":{"role":"user","content":"幫我看看 README\n<system-reminder>\n注入內容\n</system-reminder>"}}
{"type":"assistant","timestamp":"2026-07-06T10:00:05Z","message":{"role":"assistant","content":[{"type":"text","text":"好，我來讀。"},{"type":"tool_use","name":"Read","input":{"file_path":"/tmp/README.md"}}]}}
{"type":"user","timestamp":"2026-07-06T10:00:06Z","message":{"role":"user","content":[{"type":"tool_result","content":"line1\nline2\nline3"}]}}
{"type":"assistant","timestamp":"2026-07-06T10:00:10Z","message":{"role":"assistant","content":[{"type":"text","text":"README 有三行。"}]}}
```

- [ ] **Step 2: 寫失敗測試**

`tools/lib/render.test.ts`:
```ts
import { expect, test } from "bun:test";
import { renderTranscript } from "./render";

const jsonl = await Bun.file(new URL("../fixtures/session.jsonl", import.meta.url)).text();

test("逐字保存對話、剝除雜訊、工具壓縮", () => {
  const r = renderTranscript(jsonl, "sess-1");
  expect(r.markdown).toContain("幫我看看 README");
  expect(r.markdown).not.toContain("注入內容");
  expect(r.markdown).toContain("> 🔧 Read(");
  expect(r.markdown).toContain("README 有三行。");
});

test("tool_result-only 不成為獨立 user 回合", () => {
  const r = renderTranscript(jsonl, "sess-1");
  const userTurns = r.markdown.match(/^### User/gm) ?? [];
  expect(userTurns.length).toBe(1);
});

test("metadata 正確", () => {
  const r = renderTranscript(jsonl, "sess-1");
  expect(r.date).toBe("2026-07-06");
  expect(r.projectSlug).toBe("llm-wiki");
  expect(r.title).toContain("幫我看看 README");
});
```

- [ ] **Step 3: 執行確認失敗**

Run: `bun test tools/lib/render.test.ts`
Expected: FAIL

- [ ] **Step 4: 實作**

`tools/lib/render.ts`:
```ts
import { stripNoise } from "./noise";
import { deriveProjectSlug } from "./safety";

export interface RenderedTranscript {
  markdown: string;
  sessionId: string;
  projectSlug: string | null;
  date: string;
  title: string;
}

const RESULT_HEAD_TAIL = 20;

type Block = { type: string; text?: string; name?: string; input?: unknown; content?: unknown };

function clipResult(content: unknown): string {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const lines = text.split("\n");
  if (lines.length <= RESULT_HEAD_TAIL * 2) return text;
  const omitted = lines.length - RESULT_HEAD_TAIL * 2;
  return [...lines.slice(0, RESULT_HEAD_TAIL), `… (省略 ${omitted} 行)`, ...lines.slice(-RESULT_HEAD_TAIL)].join("\n");
}

function summarizeToolUse(b: Block): string {
  const input = JSON.stringify(b.input ?? {});
  const short = input.length > 120 ? input.slice(0, 120) + "…" : input;
  return `> 🔧 ${b.name ?? "tool"}(${short})`;
}

function extractParts(content: unknown): { text: string[]; tools: string[]; isToolResultOnly: boolean } {
  if (typeof content === "string") return { text: [content], tools: [], isToolResultOnly: false };
  const text: string[] = [];
  const tools: string[] = [];
  let sawText = false;
  if (Array.isArray(content)) {
    for (const b of content as Block[]) {
      if (b.type === "text" && b.text) { text.push(b.text); sawText = true; }
      else if (b.type === "tool_use") tools.push(summarizeToolUse(b));
      else if (b.type === "tool_result") tools.push("> 📥 result:\n" + clipResult(b.content).split("\n").map((l) => "> " + l).join("\n"));
    }
  }
  const isToolResultOnly = !sawText && tools.length > 0 && (content as Block[]).every((b) => b.type === "tool_result");
  return { text, tools, isToolResultOnly };
}

export function renderTranscript(jsonlText: string, sessionId: string): RenderedTranscript {
  const turns: { role: "user" | "assistant"; parts: string[] }[] = [];
  let date = "";
  let title = "";

  for (const line of jsonlText.split("\n")) {
    if (!line.trim()) continue;
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    const role = entry.type === "user" ? "user" : entry.type === "assistant" ? "assistant" : null;
    if (!role || !entry.message) continue;
    if (!date && typeof entry.timestamp === "string") date = entry.timestamp.slice(0, 10);

    const { text, tools, isToolResultOnly } = extractParts(entry.message.content);
    const cleanText = text.map((t) => stripNoise(t)).filter((t) => t.trim());
    const parts = [...cleanText, ...tools];
    if (parts.length === 0) continue;

    if (role === "user" && isToolResultOnly && turns.at(-1)?.role === "assistant") {
      turns.at(-1)!.parts.push(...parts);
      continue;
    }
    if (role === "user" && !title && cleanText[0]) title = cleanText[0].split("\n")[0].slice(0, 60);
    const last = turns.at(-1);
    if (last && last.role === role) last.parts.push(...parts);
    else turns.push({ role, parts });
  }

  const body = turns
    .map((t) => `### ${t.role === "user" ? "User" : "Assistant"}\n\n${t.parts.join("\n\n")}`)
    .join("\n\n");

  return {
    markdown: body + "\n",
    sessionId,
    projectSlug: deriveProjectSlug(jsonlText),
    date: date || new Date().toISOString().slice(0, 10),
    title: title || "（無標題）",
  };
}
```

- [ ] **Step 5: 執行確認通過**

Run: `bun test tools/lib/render.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 6: Commit**

```bash
git add tools/lib/render.ts tools/lib/render.test.ts tools/fixtures/session.jsonl
git commit -m "feat: transcript render——逐字對話、工具壓縮、雜訊剝除"
```

---

### Task 6: vault 骨架（scaffold，冪等）

**Files:**
- Create: `tools/cli/scaffold.ts`, `tools/cli/scaffold.test.ts`

**Interfaces:**
- Consumes: `serializeNote`（Task 2）
- Produces:
  - `scaffoldVault(vaultRoot: string): string[]`（建立缺少的檔案，回傳新建路徑；已存在的**絕不覆寫**）
  - 建立：PARA 四資料夾、`palace/{wake,entities,raw/{conversations,clippings,journal}}`、`palace/wake/identity.md`（user_managed: true 模板）、`palace/wake/essential-story.md`、`palace/map.md`（含 4 句格式規範 TL;DR）、`palace/log.md`、root `vault/index.md`（僅 `okf_version: "0.1"` frontmatter）、`vault/.obsidian/app.json`（`{"useMarkdownLinks":true,"newLinkFormat":"relative","alwaysUpdateLinks":true}`）

- [ ] **Step 1: 寫失敗測試**

`tools/cli/scaffold.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldVault } from "./scaffold";

test("建立完整骨架且冪等、不覆寫既有檔", () => {
  const root = mkdtempSync(join(tmpdir(), "vault-"));
  const created = scaffoldVault(root);
  expect(created.length).toBeGreaterThan(5);
  expect(existsSync(join(root, "palace/wake/identity.md"))).toBe(true);
  expect(existsSync(join(root, ".obsidian/app.json"))).toBe(true);
  expect(readFileSync(join(root, "index.md"), "utf8")).toContain("okf_version");

  writeFileSync(join(root, "palace/wake/identity.md"), "改過的內容");
  const second = scaffoldVault(root);
  expect(second).toEqual([]);
  expect(readFileSync(join(root, "palace/wake/identity.md"), "utf8")).toBe("改過的內容");
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `bun test tools/cli/scaffold.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

`tools/cli/scaffold.ts`:
```ts
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { serializeNote } from "../lib/frontmatter";

const TODAY = new Date().toISOString().slice(0, 10);

function note(type: string, title: string, description: string, body: string, extra: Record<string, unknown> = {}): string {
  return serializeNote({ type, title, description, date: TODAY, ...extra }, body);
}

const FILES: Record<string, string> = {
  "index.md": `---\nokf_version: "0.1"\n---\n\n# Subdirectories\n\n* [projects](projects/index.md) - 進行中的專案\n* [areas](areas/index.md) - 持續責任\n* [resources](resources/index.md) - 知識主題\n* [archives](archives/index.md) - 已完結\n* [palace](palace/index.md) - 記憶宮殿\n`,
  "palace/wake/identity.md": note("wake", "Identity", "我是誰、關鍵的人、原則（L0，常駐注入）。", "# Identity\n\n（請手動填寫：你是誰、關鍵的人、互動原則。此檔 LLM 只讀。）\n", { user_managed: true }),
  "palace/wake/essential-story.md": note("wake", "Essential Story", "現在什麼最重要（L1，常駐注入，由蒸餾流程重編譯）。", "# Essential Story\n\n（由 /digest 依 PARA 活躍專案重編譯；≤15 條、≤3200 字元。）\n", { user_managed: false }),
  "palace/map.md": note("moc", "Palace Map", "closet pointer 式壓縮索引，LLM 掃描用。", "# Palace Map\n\n> 格式：每行一指標 `- 主題短語 | 實體;實體 | YYYY-MM-DD | →[標題](相對路徑.md)`。\n> 行 ≤120 字元；本檔分片 ≤1500 字元。\n> 由 /digest 追加；miss 時 fallback 全文 grep。\n> 指標指向 raw 檔或 wiki 頁的錨點。\n"),
  "palace/log.md": `# Log\n\n## ${TODAY}\n\n* **Creation**: vault 初始化。\n`,
  ".obsidian/app.json": JSON.stringify({ useMarkdownLinks: true, newLinkFormat: "relative", alwaysUpdateLinks: true }, null, 2) + "\n",
};

const DIRS = [
  "projects", "areas", "resources", "archives",
  "palace/wake", "palace/entities",
  "palace/raw/conversations", "palace/raw/clippings", "palace/raw/journal",
];

export function scaffoldVault(vaultRoot: string): string[] {
  const created: string[] = [];
  for (const d of DIRS) mkdirSync(join(vaultRoot, d), { recursive: true });
  for (const [rel, content] of Object.entries(FILES)) {
    const p = join(vaultRoot, rel);
    if (existsSync(p)) continue;
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
    created.push(p);
  }
  return created;
}

if (import.meta.main) {
  const root = process.argv[2] ?? join(process.cwd(), "vault");
  const created = scaffoldVault(root);
  console.log(created.length ? `建立 ${created.length} 個檔案` : "骨架已存在，未變更");
}
```

- [ ] **Step 4: 執行確認通過**

Run: `bun test tools/cli/scaffold.test.ts`
Expected: PASS

- [ ] **Step 5: 實際建立 vault 並 commit**

Run: `bun run scaffold`
Expected: `建立 6 個檔案`；`vault/` 出現完整骨架

```bash
git add tools/cli/scaffold.ts tools/cli/scaffold.test.ts vault/
git commit -m "feat: vault 骨架——PARA + palace 結構、wake 模板、Obsidian 設定"
```

---

### Task 7: archive 模組（寫入 raw 層）

**Files:**
- Create: `tools/lib/archive.ts`, `tools/lib/archive.test.ts`

**Interfaces:**
- Consumes: `renderTranscript`（Task 5）、`sanitizeSessionId`/`validateTranscriptPath`（Task 3）、`serializeNote`（Task 2）
- Produces:
  - `archiveTranscript(transcriptPath: string, vaultRoot: string, sessionId: string): { outPath: string; written: boolean }`
  - 目的地：`<vaultRoot>/palace/raw/conversations/<projectSlug ?? "unsorted">/<date>_<sessionId>.md`
  - frontmatter：`type: raw-log`、title、description（title 前綴）、tags `[palace/raw, conversation]`、timestamp（ISO 含時區）、date、source `claude-session:<id>`、`project` 擴充欄位
  - 冪等：同輸入覆寫同一檔；transcript 不存在或 sessionId 非法 → throw Error

- [ ] **Step 1: 寫失敗測試**

`tools/lib/archive.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveTranscript } from "./archive";
import { parseNote } from "./frontmatter";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "arch-"));
  const t = join(dir, "sess-1.jsonl");
  cpSync(new URL("../fixtures/session.jsonl", import.meta.url).pathname, t);
  return { vault: mkdtempSync(join(tmpdir(), "vault-")), t };
}

test("歸檔到正確路徑且 frontmatter 合規", () => {
  const { vault, t } = setup();
  const { outPath, written } = archiveTranscript(t, vault, "sess-1");
  expect(written).toBe(true);
  expect(outPath).toContain("palace/raw/conversations/llm-wiki/2026-07-06_sess-1.md");
  const { frontmatter, body } = parseNote(readFileSync(outPath, "utf8"));
  expect(frontmatter?.type).toBe("raw-log");
  expect(frontmatter?.source).toBe("claude-session:sess-1");
  expect(body).toContain("幫我看看 README");
});

test("冪等覆寫", () => {
  const { vault, t } = setup();
  archiveTranscript(t, vault, "sess-1");
  const { written } = archiveTranscript(t, vault, "sess-1");
  expect(written).toBe(true); // 覆寫同一檔，不產生第二個檔
});

test("非法 sessionId 拒絕", () => {
  const { vault, t } = setup();
  expect(() => archiveTranscript(t, vault, "../evil")).toThrow();
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `bun test tools/lib/archive.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

`tools/lib/archive.ts`:
```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderTranscript } from "./render";
import { sanitizeSessionId, validateTranscriptPath } from "./safety";
import { serializeNote } from "./frontmatter";

export function archiveTranscript(
  transcriptPath: string,
  vaultRoot: string,
  sessionId: string,
): { outPath: string; written: boolean } {
  const sid = sanitizeSessionId(sessionId);
  if (!sid) throw new Error(`非法 session id: ${sessionId}`);
  const tp = validateTranscriptPath(transcriptPath);
  if (!tp) throw new Error(`非法 transcript 路徑: ${transcriptPath}`);

  const jsonl = readFileSync(tp, "utf8");
  const r = renderTranscript(jsonl, sid);
  const dir = join(vaultRoot, "palace/raw/conversations", r.projectSlug ?? "unsorted");
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, `${r.date}_${sid}.md`);

  const content = serializeNote(
    {
      type: "raw-log",
      title: r.title,
      description: `對話逐字紀錄：${r.title}`,
      tags: ["palace/raw", "conversation"],
      timestamp: new Date().toISOString(),
      date: r.date,
      source: `claude-session:${sid}`,
      project: r.projectSlug ?? "unsorted",
    },
    r.markdown,
  );
  writeFileSync(outPath, content);
  return { outPath, written: true };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `bun test tools/lib/archive.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add tools/lib/archive.ts tools/lib/archive.test.ts
git commit -m "feat: archive——transcript 冪等歸檔至 palace/raw"
```

---

### Task 8: state 模組（節流游標與錯誤日誌）

**Files:**
- Create: `tools/lib/state.ts`, `tools/lib/state.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `SAVE_INTERVAL = 15`
  - `countUserMessages(jsonlText: string): number`（type==="user"、content 非 tool_result-only、文字不含 `<command-message>`）
  - `readLastSave(repoRoot: string, sessionId: string): number`（無檔回 0）
  - `writeLastSave(repoRoot: string, sessionId: string, count: number): void`
  - `clearSession(repoRoot: string, sessionId: string): void`
  - `logHookError(repoRoot: string, hook: string, err: unknown): void`（append `.palace-state/hooks.log`）
  - 狀態檔：`<repoRoot>/.palace-state/<sessionId>_last_save`（純數字文字）

- [ ] **Step 1: 寫失敗測試**

`tools/lib/state.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SAVE_INTERVAL, countUserMessages, readLastSave, writeLastSave, clearSession, logHookError } from "./state";

test("countUserMessages 跳過 tool_result 與 slash command", () => {
  const jsonl = [
    JSON.stringify({ type: "user", message: { content: "正常訊息" } }),
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "x" }] } }),
    JSON.stringify({ type: "user", message: { content: "<command-message>digest</command-message>" } }),
    JSON.stringify({ type: "assistant", message: { content: "回應" } }),
  ].join("\n");
  expect(countUserMessages(jsonl)).toBe(1);
  expect(SAVE_INTERVAL).toBe(15);
});

test("last_save 游標讀寫與清除", () => {
  const root = mkdtempSync(join(tmpdir(), "state-"));
  expect(readLastSave(root, "s1")).toBe(0);
  writeLastSave(root, "s1", 15);
  expect(readLastSave(root, "s1")).toBe(15);
  clearSession(root, "s1");
  expect(readLastSave(root, "s1")).toBe(0);
});

test("logHookError 附加到 hooks.log", () => {
  const root = mkdtempSync(join(tmpdir(), "state-"));
  logHookError(root, "stop", new Error("boom"));
  const log = readFileSync(join(root, ".palace-state/hooks.log"), "utf8");
  expect(log).toContain("stop");
  expect(log).toContain("boom");
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `bun test tools/lib/state.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

`tools/lib/state.ts`:
```ts
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, appendFileSync } from "node:fs";
import { join } from "node:path";

export const SAVE_INTERVAL = 15;

function stateDir(repoRoot: string): string {
  const d = join(repoRoot, ".palace-state");
  mkdirSync(d, { recursive: true });
  return d;
}

function markerPath(repoRoot: string, sessionId: string): string {
  return join(stateDir(repoRoot), `${sessionId}_last_save`);
}

export function countUserMessages(jsonlText: string): number {
  let n = 0;
  for (const line of jsonlText.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.type !== "user" || !e.message) continue;
      const c = e.message.content;
      if (typeof c === "string") {
        if (!c.includes("<command-message>")) n++;
      } else if (Array.isArray(c)) {
        const hasText = c.some((b: any) => b.type === "text" && b.text && !String(b.text).includes("<command-message>"));
        if (hasText) n++;
      }
    } catch { continue; }
  }
  return n;
}

export function readLastSave(repoRoot: string, sessionId: string): number {
  const p = markerPath(repoRoot, sessionId);
  if (!existsSync(p)) return 0;
  const v = parseInt(readFileSync(p, "utf8").trim(), 10);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

export function writeLastSave(repoRoot: string, sessionId: string, count: number): void {
  writeFileSync(markerPath(repoRoot, sessionId), String(count));
}

export function clearSession(repoRoot: string, sessionId: string): void {
  rmSync(markerPath(repoRoot, sessionId), { force: true });
}

export function logHookError(repoRoot: string, hook: string, err: unknown): void {
  const line = `${new Date().toISOString()} [${hook}] ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`;
  appendFileSync(join(stateDir(repoRoot), "hooks.log"), line);
}
```

- [ ] **Step 4: 執行確認通過**

Run: `bun test tools/lib/state.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add tools/lib/state.ts tools/lib/state.test.ts
git commit -m "feat: state——節流游標、user 訊息計數、hooks 錯誤日誌"
```

---

### Task 9: hookio 共用層 + Stop hook

**Files:**
- Create: `tools/lib/hookio.ts`, `tools/hooks/stop.ts`, `tools/hooks/stop.test.ts`

**Interfaces:**
- Consumes: `archiveTranscript`（Task 7）、state 模組（Task 8）、safety（Task 3）
- Produces:
  - `readStdinJson(): Promise<any>`、`emit(obj: unknown): void`（stdout 單行 JSON）
  - `repoRoot(): string`（`CLAUDE_PROJECT_DIR` 環境變數，fallback `process.cwd()`）
  - `vaultRoot(): string`（`<repoRoot>/vault`）
  - Stop hook 行為：`stop_hook_active` 為 true → 直接 `{}`；user 訊息數 − last_save < SAVE_INTERVAL → `{}`；達門檻 → **同步**歸檔（Bun 冷啟快，render 純文字，不需背景 spawn）→ 更新游標 → `{}`；任何錯誤 → log + `{}`
  - 測試方式：hooks 以 `runStopHook(input, deps)` 純函式實作、入口檔只做 stdin/stdout 接線，deps 可注入 mock

- [ ] **Step 1: 寫 hookio**

`tools/lib/hookio.ts`:
```ts
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
```

- [ ] **Step 2: 寫失敗測試**

`tools/hooks/stop.test.ts`:
```ts
import { expect, test } from "bun:test";
import { runStopHook, type StopDeps } from "./stop";

function deps(overrides: Partial<StopDeps> = {}): StopDeps & { archived: string[] } {
  const archived: string[] = [];
  return {
    archived,
    countUser: () => 20,
    readLast: () => 0,
    writeLast: () => {},
    archive: (t: string) => { archived.push(t); },
    readTranscript: () => "",
    log: () => {},
    ...overrides,
  } as StopDeps & { archived: string[] };
}

test("stop_hook_active 直接放行不歸檔", () => {
  const d = deps();
  const out = runStopHook({ session_id: "s1", transcript_path: "/tmp/t.jsonl", stop_hook_active: true }, d);
  expect(out).toEqual({});
  expect(d.archived).toEqual([]);
});

test("未達節流門檻不歸檔", () => {
  const d = deps({ countUser: () => 5 });
  runStopHook({ session_id: "s1", transcript_path: "/tmp/t.jsonl" }, d);
  expect(d.archived).toEqual([]);
});

test("達門檻歸檔並推進游標", () => {
  let saved = -1;
  const d = deps({ writeLast: (_r, _s, n) => { saved = n; } });
  runStopHook({ session_id: "s1", transcript_path: "/tmp/t.jsonl" }, d);
  expect(d.archived.length).toBe(1);
  expect(saved).toBe(20);
});

test("錯誤時仍回 {} 並記 log", () => {
  let logged = false;
  const d = deps({ archive: () => { throw new Error("boom"); }, log: () => { logged = true; } });
  const out = runStopHook({ session_id: "s1", transcript_path: "/tmp/t.jsonl" }, d);
  expect(out).toEqual({});
  expect(logged).toBe(true);
});
```

- [ ] **Step 3: 執行確認失敗**

Run: `bun test tools/hooks/stop.test.ts`
Expected: FAIL

- [ ] **Step 4: 實作**

`tools/hooks/stop.ts`:
```ts
import { readFileSync } from "node:fs";
import { readStdinJson, emit, repoRoot, vaultRoot } from "../lib/hookio";
import { archiveTranscript } from "../lib/archive";
import { SAVE_INTERVAL, countUserMessages, readLastSave, writeLastSave, logHookError } from "../lib/state";
import { sanitizeSessionId, validateTranscriptPath } from "../lib/safety";

export interface StopDeps {
  countUser: (jsonl: string) => number;
  readLast: (root: string, sid: string) => number;
  writeLast: (root: string, sid: string, n: number) => void;
  archive: (transcriptPath: string, sid: string) => void;
  readTranscript: (p: string) => string;
  log: (hook: string, err: unknown) => void;
}

export function runStopHook(input: any, d: StopDeps): Record<string, never> {
  try {
    if (input.stop_hook_active === true) return {};
    const sid = sanitizeSessionId(String(input.session_id ?? ""));
    const tp = validateTranscriptPath(String(input.transcript_path ?? ""));
    if (!sid || !tp) return {};
    const count = d.countUser(d.readTranscript(tp));
    if (count - d.readLast(repoRoot(), sid) < SAVE_INTERVAL) return {};
    d.archive(tp, sid);
    d.writeLast(repoRoot(), sid, count);
  } catch (err) {
    try { d.log("stop", err); } catch {}
  }
  return {};
}

if (import.meta.main) {
  const input = await readStdinJson();
  emit(
    runStopHook(input, {
      countUser: countUserMessages,
      readLast: readLastSave,
      writeLast: writeLastSave,
      archive: (tp, sid) => archiveTranscript(tp, vaultRoot(), sid),
      readTranscript: (p) => readFileSync(p, "utf8"),
      log: (h, e) => logHookError(repoRoot(), h, e),
    }),
  );
}
```

- [ ] **Step 5: 執行確認通過**

Run: `bun test tools/hooks/stop.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 6: Commit**

```bash
git add tools/lib/hookio.ts tools/hooks/stop.ts tools/hooks/stop.test.ts
git commit -m "feat: Stop hook——節流歸檔、迴圈防護、錯誤不擋對話"
```

---

### Task 10: PreCompact hook

**Files:**
- Create: `tools/hooks/precompact.ts`, `tools/hooks/precompact.test.ts`

**Interfaces:**
- Consumes: Task 9 的 deps 模式與 archive/safety/state
- Produces: `runPreCompactHook(input, deps): {}`——**無條件同步歸檔**（無節流、無 stop_hook_active 檢查），成功後也推進游標（避免緊接的 Stop 重複歸檔）；錯誤 log + `{}`

- [ ] **Step 1: 寫失敗測試**

`tools/hooks/precompact.test.ts`:
```ts
import { expect, test } from "bun:test";
import { runPreCompactHook } from "./precompact";

test("無條件歸檔", () => {
  const archived: string[] = [];
  const out = runPreCompactHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    {
      countUser: () => 2, // 遠低於節流門檻仍要歸檔
      readLast: () => 0,
      writeLast: () => {},
      archive: (t) => { archived.push(t); },
      readTranscript: () => "",
      log: () => {},
    },
  );
  expect(out).toEqual({});
  expect(archived.length).toBe(1);
});

test("錯誤時回 {} 不 throw", () => {
  const out = runPreCompactHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    { countUser: () => 0, readLast: () => 0, writeLast: () => {}, archive: () => { throw new Error("x"); }, readTranscript: () => "", log: () => {} },
  );
  expect(out).toEqual({});
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `bun test tools/hooks/precompact.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

`tools/hooks/precompact.ts`:
```ts
import { readFileSync } from "node:fs";
import { readStdinJson, emit, repoRoot, vaultRoot } from "../lib/hookio";
import { archiveTranscript } from "../lib/archive";
import { countUserMessages, readLastSave, writeLastSave, logHookError } from "../lib/state";
import { sanitizeSessionId, validateTranscriptPath } from "../lib/safety";
import type { StopDeps } from "./stop";

export function runPreCompactHook(input: any, d: StopDeps): Record<string, never> {
  try {
    const sid = sanitizeSessionId(String(input.session_id ?? ""));
    const tp = validateTranscriptPath(String(input.transcript_path ?? ""));
    if (!sid || !tp) return {};
    d.archive(tp, sid);
    d.writeLast(repoRoot(), sid, d.countUser(d.readTranscript(tp)));
  } catch (err) {
    try { d.log("precompact", err); } catch {}
  }
  return {};
}

if (import.meta.main) {
  const input = await readStdinJson();
  emit(
    runPreCompactHook(input, {
      countUser: countUserMessages,
      readLast: readLastSave,
      writeLast: writeLastSave,
      archive: (tp, sid) => archiveTranscript(tp, vaultRoot(), sid),
      readTranscript: (p) => readFileSync(p, "utf8"),
      log: (h, e) => logHookError(repoRoot(), h, e),
    }),
  );
}
```

- [ ] **Step 4: 執行確認通過**

Run: `bun test tools/hooks/precompact.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/hooks/precompact.ts tools/hooks/precompact.test.ts
git commit -m "feat: PreCompact hook——壓縮前無條件同步歸檔"
```

---

### Task 11: SessionEnd hook

**Files:**
- Create: `tools/hooks/sessionend.ts`, `tools/hooks/sessionend.test.ts`

**Interfaces:**
- Consumes: 同 Task 10 + `clearSession`（Task 8）
- Produces: `runSessionEndHook(input, deps): {}`——無條件歸檔（補短 session 漏洞）+ `clearSession` 清游標；錯誤 log + `{}`。入口檔直接同步執行（Bun 冷啟 + 純文字 render 遠低於 SessionEnd 時限；不需 detach 花招）

- [ ] **Step 1: 寫失敗測試**

`tools/hooks/sessionend.test.ts`:
```ts
import { expect, test } from "bun:test";
import { runSessionEndHook } from "./sessionend";

test("歸檔並清除 session 游標", () => {
  const archived: string[] = [];
  let cleared = false;
  const out = runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    {
      archive: (t) => { archived.push(t); },
      clear: () => { cleared = true; },
      log: () => {},
    },
  );
  expect(out).toEqual({});
  expect(archived.length).toBe(1);
  expect(cleared).toBe(true);
});

test("歸檔失敗仍清游標且回 {}", () => {
  let cleared = false;
  const out = runSessionEndHook(
    { session_id: "s1", transcript_path: "/tmp/t.jsonl" },
    { archive: () => { throw new Error("x"); }, clear: () => { cleared = true; }, log: () => {} },
  );
  expect(out).toEqual({});
  expect(cleared).toBe(true);
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `bun test tools/hooks/sessionend.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

`tools/hooks/sessionend.ts`:
```ts
import { readStdinJson, emit, repoRoot, vaultRoot } from "../lib/hookio";
import { archiveTranscript } from "../lib/archive";
import { clearSession, logHookError } from "../lib/state";
import { sanitizeSessionId, validateTranscriptPath } from "../lib/safety";

export interface SessionEndDeps {
  archive: (transcriptPath: string, sid: string) => void;
  clear: (sid: string) => void;
  log: (hook: string, err: unknown) => void;
}

export function runSessionEndHook(input: any, d: SessionEndDeps): Record<string, never> {
  const sid = sanitizeSessionId(String(input.session_id ?? ""));
  const tp = validateTranscriptPath(String(input.transcript_path ?? ""));
  if (!sid) return {};
  try {
    if (tp) d.archive(tp, sid);
  } catch (err) {
    try { d.log("sessionend", err); } catch {}
  } finally {
    try { d.clear(sid); } catch {}
  }
  return {};
}

if (import.meta.main) {
  const input = await readStdinJson();
  emit(
    runSessionEndHook(input, {
      archive: (tp, sid) => archiveTranscript(tp, vaultRoot(), sid),
      clear: (sid) => clearSession(repoRoot(), sid),
      log: (h, e) => logHookError(repoRoot(), h, e),
    }),
  );
}
```

- [ ] **Step 4: 執行確認通過**

Run: `bun test tools/hooks/sessionend.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/hooks/sessionend.ts tools/hooks/sessionend.test.ts
git commit -m "feat: SessionEnd hook——最終歸檔與游標清理"
```

---

### Task 12: wake 模組 + SessionStart hook

**Files:**
- Create: `tools/lib/wake.ts`, `tools/lib/wake.test.ts`, `tools/hooks/sessionstart.ts`

**Interfaces:**
- Consumes: `parseNote`（Task 2）
- Produces:
  - `WAKE_MAX_CHARS = 3600`
  - `buildWakeBundle(vaultRoot: string): { text: string; chars: number; withinBudget: boolean }`——讀 `palace/wake/identity.md` + `palace/wake/essential-story.md` 的 **body**（不含 frontmatter），以 `\n\n---\n\n` 串接；檔案缺失以空字串處理
  - SessionStart hook 輸出：`{ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } }`；超預算時截斷至 WAKE_MAX_CHARS 並在 hooks.log 記警告；錯誤時輸出 `{}`

- [ ] **Step 1: 寫失敗測試**

`tools/lib/wake.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWakeBundle, WAKE_MAX_CHARS } from "./wake";

function vaultWith(identity: string, story: string): string {
  const root = mkdtempSync(join(tmpdir(), "wake-"));
  mkdirSync(join(root, "palace/wake"), { recursive: true });
  writeFileSync(join(root, "palace/wake/identity.md"), `---\ntype: wake\n---\n\n${identity}`);
  writeFileSync(join(root, "palace/wake/essential-story.md"), `---\ntype: wake\n---\n\n${story}`);
  return root;
}

test("串接兩檔 body、不含 frontmatter", () => {
  const root = vaultWith("我是 Justin 的記憶系統", "本週焦點：memory system");
  const b = buildWakeBundle(root);
  expect(b.text).toContain("我是 Justin 的記憶系統");
  expect(b.text).toContain("本週焦點");
  expect(b.text).not.toContain("type: wake");
  expect(b.withinBudget).toBe(true);
});

test("超預算標記", () => {
  const root = vaultWith("x".repeat(4000), "y");
  const b = buildWakeBundle(root);
  expect(b.chars).toBeGreaterThan(WAKE_MAX_CHARS);
  expect(b.withinBudget).toBe(false);
});

test("檔案缺失時空字串", () => {
  const root = mkdtempSync(join(tmpdir(), "wake-"));
  expect(buildWakeBundle(root).text).toBe("");
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `bun test tools/lib/wake.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

`tools/lib/wake.ts`:
```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseNote } from "./frontmatter";

export const WAKE_MAX_CHARS = 3600;

function bodyOf(path: string): string {
  if (!existsSync(path)) return "";
  return parseNote(readFileSync(path, "utf8")).body.trim();
}

export function buildWakeBundle(vaultRoot: string): { text: string; chars: number; withinBudget: boolean } {
  const parts = [
    bodyOf(join(vaultRoot, "palace/wake/identity.md")),
    bodyOf(join(vaultRoot, "palace/wake/essential-story.md")),
  ].filter((p) => p.length > 0);
  const text = parts.join("\n\n---\n\n");
  return { text, chars: text.length, withinBudget: text.length <= WAKE_MAX_CHARS };
}
```

`tools/hooks/sessionstart.ts`:
```ts
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
```

- [ ] **Step 4: 執行確認通過**

Run: `bun test tools/lib/wake.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add tools/lib/wake.ts tools/lib/wake.test.ts tools/hooks/sessionstart.ts
git commit -m "feat: wake——L0+L1 組裝與 SessionStart 注入（預算 3600 字元）"
```

---

### Task 13: hooks 註冊與端到端驗證

**Files:**
- Create: `.claude/settings.json`

**Interfaces:**
- Consumes: Tasks 9-12 的四支 hook 入口
- Produces: 本 repo 的 Claude Code session 自動掛上四支 hooks

- [ ] **Step 1: 寫 settings.json**

`.claude/settings.json`:
```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "bun \"$CLAUDE_PROJECT_DIR/tools/hooks/stop.ts\"" }] }
    ],
    "PreCompact": [
      { "hooks": [{ "type": "command", "command": "bun \"$CLAUDE_PROJECT_DIR/tools/hooks/precompact.ts\"" }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "bun \"$CLAUDE_PROJECT_DIR/tools/hooks/sessionend.ts\"" }] }
    ],
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "bun \"$CLAUDE_PROJECT_DIR/tools/hooks/sessionstart.ts\"" }] }
    ]
  }
}
```

- [ ] **Step 2: 手動驗證各 hook 可獨立執行**

Run:
```bash
echo '{"session_id":"manual-test","transcript_path":"'$PWD'/tools/fixtures/session.jsonl","stop_hook_active":false}' | bun tools/hooks/precompact.ts
ls vault/palace/raw/conversations/llm-wiki/
```
Expected: 輸出 `{}`；`2026-07-06_manual-test.md` 存在

Run: `echo '{}' | bun tools/hooks/sessionstart.ts`
Expected: 輸出含 `additionalContext`（identity 模板內容）

- [ ] **Step 3: 清理驗證產物並 commit**

```bash
rm vault/palace/raw/conversations/llm-wiki/2026-07-06_manual-test.md
git add .claude/settings.json
git commit -m "feat: 註冊 Stop/PreCompact/SessionEnd/SessionStart hooks"
```

---

### Task 14: backfill CLI

**Files:**
- Create: `tools/cli/backfill.ts`, `tools/cli/backfill.test.ts`

**Interfaces:**
- Consumes: `archiveTranscript`（Task 7）、`renderTranscript`（Task 5）、safety（Task 3）
- Produces:
  - `backfill(projectsDir: string, vaultRoot: string): { archived: string[]; skipped: string[] }`——掃 `<projectsDir>/**/*.jsonl`，session_id = 檔名去 `.jsonl` 過 sanitize；若目的檔已存在 → skip，否則 archive
  - CLI：`bun run backfill [projectsDir]`，預設 `~/.claude/projects`

- [ ] **Step 1: 寫失敗測試**

`tools/cli/backfill.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backfill } from "./backfill";

function setup() {
  const projects = mkdtempSync(join(tmpdir(), "proj-"));
  mkdirSync(join(projects, "-Users-me-llm-wiki"), { recursive: true });
  cpSync(new URL("../fixtures/session.jsonl", import.meta.url).pathname, join(projects, "-Users-me-llm-wiki/sess-bf.jsonl"));
  return { projects, vault: mkdtempSync(join(tmpdir(), "vault-")) };
}

test("補檔未歸檔的 session，再跑一次全 skip", () => {
  const { projects, vault } = setup();
  const first = backfill(projects, vault);
  expect(first.archived.length).toBe(1);
  expect(first.skipped.length).toBe(0);
  const second = backfill(projects, vault);
  expect(second.archived.length).toBe(0);
  expect(second.skipped.length).toBe(1);
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `bun test tools/cli/backfill.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

`tools/cli/backfill.ts`:
```ts
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { archiveTranscript } from "../lib/archive";
import { renderTranscript } from "../lib/render";
import { sanitizeSessionId } from "../lib/safety";

function findJsonl(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...findJsonl(p));
    else if (e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

export function backfill(projectsDir: string, vaultRoot: string): { archived: string[]; skipped: string[] } {
  const archived: string[] = [];
  const skipped: string[] = [];
  for (const file of findJsonl(projectsDir)) {
    const sid = sanitizeSessionId(basename(file, ".jsonl"));
    if (!sid) continue;
    const r = renderTranscript(readFileSync(file, "utf8"), sid);
    const target = join(vaultRoot, "palace/raw/conversations", r.projectSlug ?? "unsorted", `${r.date}_${sid}.md`);
    if (existsSync(target)) { skipped.push(file); continue; }
    archiveTranscript(file, vaultRoot, sid);
    archived.push(file);
  }
  return { archived, skipped };
}

if (import.meta.main) {
  const projectsDir = process.argv[2] ?? join(homedir(), ".claude/projects");
  const vault = join(process.cwd(), "vault");
  const r = backfill(projectsDir, vault);
  console.log(`歸檔 ${r.archived.length} 個 session，跳過 ${r.skipped.length} 個（已存在）`);
}
```

- [ ] **Step 4: 執行確認通過**

Run: `bun test tools/cli/backfill.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/cli/backfill.ts tools/cli/backfill.test.ts
git commit -m "feat: backfill——掃描補檔未歸檔的 session"
```

---

### Task 15: index 重生（確定性）

**Files:**
- Create: `tools/lib/indexgen.ts`, `tools/lib/indexgen.test.ts`, `tools/cli/reindex.ts`

**Interfaces:**
- Consumes: `parseNote`（Task 2）
- Produces:
  - `regenerateIndexes(vaultRoot: string): string[]`——bottom-up 為每個目錄（含 root，排除 `.obsidian`）重寫 `index.md`：`# Subdirectories` 段（`* [name](name/index.md) - 首行描述`）+ `# Notes` 段（`* [title](file.md) - description`，title/description 取自 frontmatter，缺 title 用檔名、缺 description 空白）；root index.md 保留 `okf_version` frontmatter；子目錄 index.md 無 frontmatter（OKF §6）；跳過保留檔（index.md/log.md）與非 .md 檔；輸出確定性排序（字典序）
  - CLI：`bun run reindex`

- [ ] **Step 1: 寫失敗測試**

`tools/lib/indexgen.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { regenerateIndexes } from "./indexgen";

test("生成兩層 index，description 上提，root 保留 okf_version", () => {
  const root = mkdtempSync(join(tmpdir(), "idx-"));
  mkdirSync(join(root, "projects/demo"), { recursive: true });
  writeFileSync(join(root, "projects/demo/note-a.md"), `---\ntype: note\ntitle: Note A\ndescription: 測試筆記\n---\n\nbody\n`);
  writeFileSync(join(root, "index.md"), `---\nokf_version: "0.1"\n---\n\n# 舊內容\n`);

  const written = regenerateIndexes(root);
  expect(written.length).toBeGreaterThanOrEqual(3); // root、projects、projects/demo

  const demo = readFileSync(join(root, "projects/demo/index.md"), "utf8");
  expect(demo).toContain("* [Note A](note-a.md) - 測試筆記");
  expect(demo.startsWith("---")).toBe(false); // 子目錄 index 無 frontmatter

  const rootIdx = readFileSync(join(root, "index.md"), "utf8");
  expect(rootIdx).toContain("okf_version");
  expect(rootIdx).toContain("* [projects](projects/index.md)");
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `bun test tools/lib/indexgen.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

`tools/lib/indexgen.ts`:
```ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseNote } from "./frontmatter";

const RESERVED = new Set(["index.md", "log.md"]);

function describeDir(dir: string): string {
  // 目錄描述：取其 index.md 第一個條目前的既有描述不可靠，採固定空白（確定性優先）
  return "";
}

function indexDir(dir: string, isRoot: boolean, written: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.name !== ".obsidian" && !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));

  const subdirs = entries.filter((e) => e.isDirectory());
  const notes = entries.filter((e) => e.isFile() && e.name.endsWith(".md") && !RESERVED.has(e.name));

  for (const d of subdirs) indexDir(join(dir, d.name), false, written);

  const lines: string[] = [];
  if (subdirs.length) {
    lines.push("# Subdirectories", "");
    for (const d of subdirs) {
      const desc = describeDir(join(dir, d.name));
      lines.push(`* [${d.name}](${d.name}/index.md)${desc ? ` - ${desc}` : ""}`);
    }
    lines.push("");
  }
  if (notes.length) {
    lines.push("# Notes", "");
    for (const f of notes) {
      const { frontmatter } = parseNote(readFileSync(join(dir, f.name), "utf8"));
      const title = typeof frontmatter?.title === "string" ? frontmatter.title : basename(f.name, ".md");
      const desc = typeof frontmatter?.description === "string" ? frontmatter.description : "";
      lines.push(`* [${title}](${f.name})${desc ? ` - ${desc}` : ""}`);
    }
    lines.push("");
  }
  const body = lines.join("\n") || "# Empty\n";
  const content = isRoot ? `---\nokf_version: "0.1"\n---\n\n${body}` : body;
  const p = join(dir, "index.md");
  writeFileSync(p, content.endsWith("\n") ? content : content + "\n");
  written.push(p);
}

export function regenerateIndexes(vaultRoot: string): string[] {
  const written: string[] = [];
  indexDir(vaultRoot, true, written);
  return written;
}
```

`tools/cli/reindex.ts`:
```ts
import { join } from "node:path";
import { regenerateIndexes } from "../lib/indexgen";

const written = regenerateIndexes(process.argv[2] ?? join(process.cwd(), "vault"));
console.log(`重生 ${written.length} 份 index.md`);
```

- [ ] **Step 4: 執行確認通過**

Run: `bun test tools/lib/indexgen.test.ts`
Expected: PASS

- [ ] **Step 5: 對實際 vault 執行並 commit**

Run: `bun run reindex`
Expected: `重生 N 份 index.md`（N ≥ 10）

```bash
git add tools/lib/indexgen.ts tools/lib/indexgen.test.ts tools/cli/reindex.ts vault/
git commit -m "feat: index 重生——bottom-up 確定性、description 上提"
```

---

### Task 16: lint（兩級）

**Files:**
- Create: `tools/lib/lint.ts`, `tools/lib/lint.test.ts`, `tools/cli/lint.ts`

**Interfaces:**
- Consumes: `parseNote`/`validateFrontmatter`（Task 2）、`buildWakeBundle`（Task 12）
- Produces:
  - `interface LintIssue { file: string; rule: string; message: string }`
  - `lintVault(vaultRoot: string): { errors: LintIssue[]; warnings: LintIssue[] }`
  - **硬錯誤**：`frontmatter-parse`（非保留 .md 的 frontmatter 不可解析/缺失）、`type-vocab`（缺 type 或不在詞彙表）、`wake-budget`（wake bundle 超 3600 字元）、`fact-interval`（entities 的 `## Facts` 表 valid_to < valid_from）、`wikilink-ban`（body 出現 `[[`）
  - **軟提醒**：`missing-description`、`broken-link`（相對 .md 連結目標不存在）
  - CLI：`bun run lint:vault`——錯誤數 > 0 時 exit code 1

- [ ] **Step 1: 寫失敗測試**

`tools/lib/lint.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintVault } from "./lint";

function vault(): string {
  const root = mkdtempSync(join(tmpdir(), "lint-"));
  mkdirSync(join(root, "palace/wake"), { recursive: true });
  mkdirSync(join(root, "palace/entities"), { recursive: true });
  return root;
}

test("缺 frontmatter 與非法 type 是硬錯誤", () => {
  const root = vault();
  writeFileSync(join(root, "bad1.md"), "# 沒有 frontmatter\n");
  writeFileSync(join(root, "bad2.md"), "---\ntype: banana\n---\n\nx\n");
  const r = lintVault(root);
  expect(r.errors.some((e) => e.rule === "frontmatter-parse" && e.file.endsWith("bad1.md"))).toBe(true);
  expect(r.errors.some((e) => e.rule === "type-vocab" && e.file.endsWith("bad2.md"))).toBe(true);
});

test("wikilink 是硬錯誤、缺 description 是軟提醒", () => {
  const root = vault();
  writeFileSync(join(root, "n.md"), "---\ntype: note\n---\n\n看 [[別頁]]\n");
  const r = lintVault(root);
  expect(r.errors.some((e) => e.rule === "wikilink-ban")).toBe(true);
  expect(r.warnings.some((w) => w.rule === "missing-description")).toBe(true);
});

test("倒置的事實區間是硬錯誤", () => {
  const root = vault();
  writeFileSync(
    join(root, "palace/entities/max.md"),
    "---\ntype: entity\ndescription: d\n---\n\n## Facts\n\n| predicate | object | valid_from | valid_to | confidence | source |\n|---|---|---|---|---|---|\n| lives_in | 台北 | 2026-01-01 | 2025-01-01 | 1.0 | x |\n",
  );
  const r = lintVault(root);
  expect(r.errors.some((e) => e.rule === "fact-interval")).toBe(true);
});

test("斷鏈是軟提醒不是錯誤", () => {
  const root = vault();
  writeFileSync(join(root, "n.md"), "---\ntype: note\ndescription: d\n---\n\n[尚未寫的頁](future.md)\n");
  const r = lintVault(root);
  expect(r.errors.length).toBe(0);
  expect(r.warnings.some((w) => w.rule === "broken-link")).toBe(true);
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `bun test tools/lib/lint.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

`tools/lib/lint.ts`:
```ts
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { parseNote, validateFrontmatter } from "./frontmatter";
import { buildWakeBundle, WAKE_MAX_CHARS } from "./wake";

export interface LintIssue { file: string; rule: string; message: string }

const RESERVED = new Set(["index.md", "log.md"]);

function mdFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...mdFiles(p));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function checkFactTable(file: string, body: string, errors: LintIssue[]): void {
  const section = body.split(/^## Facts$/m)[1];
  if (!section) return;
  for (const line of section.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 7 || cells[1] === "predicate" || cells[1].startsWith("---")) continue;
    const [, , , from, to] = cells;
    if (from && to && /^\d{4}-\d{2}-\d{2}/.test(from) && /^\d{4}-\d{2}-\d{2}/.test(to) && to < from) {
      errors.push({ file, rule: "fact-interval", message: `倒置區間：valid_to ${to} < valid_from ${from}` });
    }
  }
}

export function lintVault(vaultRoot: string): { errors: LintIssue[]; warnings: LintIssue[] } {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];

  for (const file of mdFiles(vaultRoot)) {
    const name = file.split("/").at(-1)!;
    const text = readFileSync(file, "utf8");
    const { frontmatter, body } = parseNote(text);

    if (!RESERVED.has(name)) {
      if (!frontmatter) errors.push({ file, rule: "frontmatter-parse", message: "frontmatter 缺失或不可解析" });
      else {
        for (const msg of validateFrontmatter(frontmatter)) {
          errors.push({ file, rule: msg.includes("type") ? "type-vocab" : "frontmatter-parse", message: msg });
        }
        if (typeof frontmatter.description !== "string" || !frontmatter.description) {
          warnings.push({ file, rule: "missing-description", message: "缺 description" });
        }
      }
    }

    if (/\[\[/.test(body)) errors.push({ file, rule: "wikilink-ban", message: "body 出現 wikilink" });
    checkFactTable(file, body, errors);

    for (const m of body.matchAll(/\]\(([^)\s#]+\.md)(#[^)]*)?\)/g)) {
      const target = resolve(dirname(file), m[1]);
      if (!existsSync(target)) warnings.push({ file, rule: "broken-link", message: `斷鏈：${m[1]}` });
    }
  }

  const wake = buildWakeBundle(vaultRoot);
  if (!wake.withinBudget) {
    errors.push({ file: join(vaultRoot, "palace/wake"), rule: "wake-budget", message: `wake ${wake.chars} 字元 > ${WAKE_MAX_CHARS}` });
  }
  return { errors, warnings };
}
```

`tools/cli/lint.ts`（CLI 額外加 spec 的硬錯誤「raw 層被改寫」——用 git 比對，僅在 CLI 層因需 repo 脈絡）:
```ts
import { join, relative } from "node:path";
import { lintVault, type LintIssue } from "../lib/lint";

const vaultRoot = process.argv[2] ?? join(process.cwd(), "vault");
const r = lintVault(vaultRoot);

// 硬錯誤：palace/raw 底下「已追蹤且被修改/刪除」的檔案（新檔 A 允許，M/D 違反 append-only）
const diff = Bun.spawnSync(["git", "diff", "--name-status", "HEAD", "--", join(relative(process.cwd(), vaultRoot), "palace/raw")]);
if (diff.exitCode === 0) {
  for (const line of diff.stdout.toString().split("\n")) {
    const [status, file] = line.split("\t");
    if (status === "M" || status === "D") {
      r.errors.push({ file: file ?? "", rule: "raw-immutable", message: "palace/raw 為 append-only，不可修改或刪除既有檔" });
    }
  }
}

for (const e of r.errors) console.log(`ERROR ${e.rule} ${e.file} — ${e.message}`);
for (const w of r.warnings) console.log(`WARN  ${w.rule} ${w.file} — ${w.message}`);
console.log(`${r.errors.length} errors, ${r.warnings.length} warnings`);
process.exit(r.errors.length > 0 ? 1 : 0);
```

- [ ] **Step 4: 執行確認通過**

Run: `bun test tools/lib/lint.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: 對實際 vault 執行並 commit**

Run: `bun run lint:vault`
Expected: `0 errors`（warnings 允許）

```bash
git add tools/lib/lint.ts tools/lib/lint.test.ts tools/cli/lint.ts
git commit -m "feat: 兩級 lint——硬錯誤擋格式違規、軟提醒顧健康"
```

---

### Task 17: guard（寫入護欄）

**Files:**
- Create: `tools/lib/guard.ts`, `tools/lib/guard.test.ts`, `tools/cli/guard.ts`

**Interfaces:**
- Consumes: `parseNote`（Task 2）
- Produces:
  - `checkAugmentation(before: string, after: string): string[]`——違規訊息陣列：(a) `user_managed: true` 的檔內容有任何變動；(b) 既有 `## ` heading 在 after 消失；(c) `## Citations` 段的 `* `/`- ` 條目數減少
  - CLI：`bun tools/cli/guard.ts <file>`——比較 `git show HEAD:<file>` 與工作區；HEAD 無此檔（新檔）→ 直接通過；違規 exit 1 並列出訊息。供 /digest skill 在寫入後自我檢查

- [ ] **Step 1: 寫失敗測試**

`tools/lib/guard.test.ts`:
```ts
import { expect, test } from "bun:test";
import { checkAugmentation } from "./guard";

const before = `---\ntype: entity\nuser_managed: false\n---\n\n## Facts\n\nx\n\n## Citations\n\n* [a](a.md)\n* [b](b.md)\n`;

test("合法擴充通過", () => {
  const after = before + "\n## Links\n\n* [c](c.md)\n";
  expect(checkAugmentation(before, after)).toEqual([]);
});

test("heading 消失被擋", () => {
  const after = `---\ntype: entity\nuser_managed: false\n---\n\n## Citations\n\n* [a](a.md)\n* [b](b.md)\n`;
  expect(checkAugmentation(before, after).some((v) => v.includes("Facts"))).toBe(true);
});

test("citations 減少被擋", () => {
  const after = before.replace("* [b](b.md)\n", "");
  expect(checkAugmentation(before, after).some((v) => v.includes("Citations"))).toBe(true);
});

test("user_managed 檔任何變動被擋", () => {
  const pinned = before.replace("user_managed: false", "user_managed: true");
  expect(checkAugmentation(pinned, pinned)).toEqual([]);
  expect(checkAugmentation(pinned, pinned + "多一行\n").length).toBe(1);
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `bun test tools/lib/guard.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

`tools/lib/guard.ts`:
```ts
import { parseNote } from "./frontmatter";

function headings(body: string): string[] {
  return [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
}

function citationCount(body: string): number {
  const section = body.split(/^## Citations$/m)[1];
  if (!section) return 0;
  const untilNext = section.split(/^## /m)[0];
  return (untilNext.match(/^[*-] /gm) ?? []).length;
}

export function checkAugmentation(before: string, after: string): string[] {
  const violations: string[] = [];
  const b = parseNote(before);
  if (b.frontmatter?.user_managed === true) {
    if (before !== after) violations.push("user_managed: true 的檔案不可由 LLM 修改");
    return violations;
  }
  const a = parseNote(after);
  const afterHeadings = new Set(headings(a.body));
  for (const h of headings(b.body)) {
    if (!afterHeadings.has(h)) violations.push(`既有 heading "## ${h}" (含 Facts) 不可消失`);
  }
  if (citationCount(a.body) < citationCount(b.body)) violations.push("## Citations 條目只增不減");
  return violations;
}
```

`tools/cli/guard.ts`:
```ts
import { readFileSync } from "node:fs";
import { checkAugmentation } from "../lib/guard";

const file = process.argv[2];
if (!file) { console.error("用法: bun tools/cli/guard.ts <file>"); process.exit(2); }

const head = Bun.spawnSync(["git", "show", `HEAD:${file}`]);
if (head.exitCode !== 0) { console.log("新檔案，通過"); process.exit(0); }

const violations = checkAugmentation(head.stdout.toString(), readFileSync(file, "utf8"));
for (const v of violations) console.log(`GUARD ${v}`);
process.exit(violations.length > 0 ? 1 : 0);
```

- [ ] **Step 4: 執行確認通過**

Run: `bun test tools/lib/guard.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add tools/lib/guard.ts tools/lib/guard.test.ts tools/cli/guard.ts
git commit -m "feat: guard——heading 不消失、citations 不減、user_managed 保護"
```

---

### Task 18: /digest skill 與 CLAUDE.md schema

**Files:**
- Create: `.claude/skills/digest/SKILL.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: 全部工具（reindex、lint:vault、guard）；vault 慣例
- Produces: LLM 可依 SKILL.md 執行蒸餾；CLAUDE.md 是 schema 文件（LLM-wiki 三層架構的第三層）

- [ ] **Step 1: 寫 SKILL.md**

`.claude/skills/digest/SKILL.md`:
````markdown
---
name: digest
description: 蒸餾 palace/raw 中未消化的對話/剪報進 PARA 與宮殿結構。當使用者說「消化」「蒸餾」「digest」「整理記憶」時使用。
---

# Digest：蒸餾流程

你是 vault 的圖書館員。把 `vault/palace/raw/` 的逐字證據蒸餾成結構化記憶。

## 找出未消化的檔案

讀 `.palace-state/digest-cursor`（每行一個已消化的 raw 檔相對路徑）。列出 `vault/palace/raw/` 下所有 .md，排除已消化與 `type: raw-log` 以外開頭是 index/log 的保留檔，得到待辦清單。

## 每個檔案的蒸餾步驟

1. **讀取** raw 檔全文。
2. **路由（可行動性優先）**：先問「這服務哪個進行中的 project/area？」→ 寫進 `vault/projects/<slug>/` 或 `vault/areas/<slug>/` 的相關頁；都不是 → `vault/resources/<slug>/`；提到人/組織/工具的長期事實 → `vault/palace/entities/<slug>.md`。
3. **寫入契約（必守，順序執行）**：
   a. 先讀既有目標頁（不存在則建立，frontmatter 用統一模板、type 用封閉詞彙表）。
   b. 只合併「淨新增」資訊，保留既有內容；沒有新資訊就跳過不寫。
   c. 品質 rubric：禁臆測、禁「可能/大概/或許」模糊語、synthesize 不逐字複製、每則新知識在 `## Citations` 加來源連結（指向 raw 檔）。
   d. entity 事實表：更正 = 舊列填 `valid_to` + 追加新列，**絕不刪列**；同 predicate+object 且 valid_to 空白已存在 → 跳過。
   e. 寫完每個檔案立刻執行 `bun tools/cli/guard.ts <該檔路徑>`，違規就修正後重跑。
4. **更新宮殿**：
   - `vault/palace/map.md` 追加 pointer 行：`- 主題短語 | 實體;實體 | YYYY-MM-DD | →[標題](../相對路徑.md)`（行 ≤120 字元）。
   - 若活躍專案格局有變 → 重寫 `vault/palace/wake/essential-story.md`（≤15 條、≤3200 字元，聚焦「現在什麼最重要」）。
5. **記錄游標**：把該 raw 檔相對路徑 append 到 `.palace-state/digest-cursor`。

## 全部完成後

1. `bun run reindex`
2. `bun run lint:vault`——有硬錯誤必須修到 0
3. `vault/palace/log.md` 的今日段（無則建 `## YYYY-MM-DD`，newest first）加 `* **Ingest**: <一句摘要，N 個來源>`
4. `git add vault/ && git commit -m "digest: <摘要>"`
5. 向使用者回報：蒸餾了哪些檔、更新了哪些頁、essential-story 是否重編譯。

## 禁止事項

- 不改 `user_managed: true` 的檔（identity.md）
- 不改 `vault/palace/raw/` 既有檔案（append-only 層）
- 不用 wikilink；內部連結一律 `[標題](相對路徑.md)`
- 不發明新的 frontmatter type
````

- [ ] **Step 2: 寫 CLAUDE.md**

`CLAUDE.md`:
````markdown
# llm-wiki：個人記憶系統

雙受眾 markdown vault：`vault/projects|areas|resources|archives`（PARA，給人）+ `vault/palace/`（記憶宮殿，給 LLM）。規格見 `docs/superpowers/specs/2026-07-06-memory-system-design.md`。

## 你在此 repo 的角色

你是 vault 的圖書館員：維護 wiki、回答查詢、執行蒸餾（/digest）。使用者負責策展與提問。

## 格式鐵律

- 每個非保留 .md 必有 frontmatter，`type` ∈ `note|moc|entity|raw-log|wake|daily`
- 內部連結一律 `[標題](相對路徑.md)`；禁 `[[wikilink]]`、`![[embed]]`
- 檔名 = 唯一 slug（小寫、`-`）；人味放 `title`/`aliases`
- entity 頁固定槽位：`## Facts`（時間性事實表：舊事實填 valid_to 作廢，絕不刪列）+ `## Links` + `## Citations`
- `index.md` 是生成物（`bun run reindex`），不要手改；導覽改 `palace/map.md`
- `user_managed: true` 的檔只讀

## 檢索 SOP（回答「我記得…嗎」類問題）

1. 先讀 `vault/palace/map.md` 與相關資料夾的 `index.md` 定位
2. `grep` 多路查詢：原句 + 同義詞 + 上位概念（不要只查一次）
3. 只 read 命中的檔；需要證據時追到 `palace/raw/` 的逐字紀錄
4. 好答案值得回填：把有價值的綜合寫成 PARA 頁面（走 /digest 的寫入契約）

## 工具

- `bun test`（全部測試）｜`bun run lint:vault`（兩級 lint）｜`bun run reindex`
- `bun run backfill`（補檔歷史 session）｜`bun tools/cli/guard.ts <file>`（寫入護欄）
- hooks 已自動掛載：對話會自動逐字歸檔到 `vault/palace/raw/conversations/`
````

- [ ] **Step 3: 驗證 skill 被識別**

Run: `ls .claude/skills/digest/SKILL.md && head -5 .claude/skills/digest/SKILL.md`
Expected: 檔案存在、frontmatter 有 name/description

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/digest/SKILL.md CLAUDE.md
git commit -m "feat: /digest skill 與 CLAUDE.md schema——蒸餾契約、檢索 SOP"
```

---

### Task 19: Phase 1 HTML 使用說明書 + 端到端驗收

**Files:**
- Create: `docs/manual/phase-1.html`（自包含、無外部資源、zh-Hant-TW）

**Interfaces:**
- Consumes: 已完成的全系統
- Produces: 非程式碼導向的使用說明書——任何人讀完能理解並使用這套系統

- [ ] **Step 1: 撰寫說明書**

`docs/manual/phase-1.html` 必含章節（面向一般使用者，不出現程式碼實作細節；操作只給指令與畫面說明）：
1. **這是什麼**：雙受眾圖書館比喻（PARA 閱覽室 / palace 書庫）、解決什麼問題（RAG 不累積 vs wiki 複利）
2. **快速開始**：安裝 Bun → `bun install` → `bun run scaffold` → 用 Obsidian 開 `vault/` → 填寫 identity.md
3. **日常使用**：對話自動歸檔（三個時機）、`/digest` 什麼時候跑、在 Obsidian 看什麼（graph、PARA 資料夾、essential-story）
4. **四類記憶怎麼流動**：外部知識/對話/生活思考/專案知識各自的進入路徑與去向（附流程圖，inline SVG 或 CSS 圖）
5. **保養**：`lint:vault` 健康檢查、`backfill` 補檔、git 版本安全網
6. **常見問題**：漏歸檔怎麼辦、想改 index.md、手機怎麼看、如何反悔一次蒸餾
7. 樣式：淺色/深色皆可讀、無外部字型/CDN

- [ ] **Step 2: 端到端驗收（人工檢查表）**

依序驗證並記錄結果：
```bash
bun test                 # 全綠
bun run lint:vault       # 0 errors
echo '{"session_id":"e2e-test","transcript_path":"'$PWD'/tools/fixtures/session.jsonl"}' | bun tools/hooks/precompact.ts && ls vault/palace/raw/conversations/llm-wiki/
echo '{}' | bun tools/hooks/sessionstart.ts   # 輸出含 additionalContext
rm vault/palace/raw/conversations/llm-wiki/*e2e-test.md
```
Expected: 全部符合；另在真實新 session 確認 wake 注入與 Stop 歸檔（開新 session 對話 15+ 則後看 raw/）

- [ ] **Step 3: Commit**

```bash
git add docs/manual/phase-1.html
git commit -m "docs: Phase 1 HTML 使用說明書"
```

---

## Phase 2 計畫（branch: phase-2）

> Phase 2 於 `phase-2` branch 進行（自 `phase-1` 分出）。前置：Phase 1 驗收通過。

### Task 20: 自動蒸餾觸發（SessionEnd → headless digest）

**Files:**
- Create: `tools/lib/autodigest.ts`, `tools/lib/autodigest.test.ts`
- Modify: `tools/hooks/sessionend.ts`（歸檔後 spawn detached headless digest）

**Interfaces:**
- Consumes: Task 11 SessionEnd、`claude` CLI
- Produces:
  - `spawnAutoDigest(repoRoot: string): void`——`Bun.spawn(["claude", "-p", "/digest", "--permission-mode", "acceptEdits"], { cwd: repoRoot, stdio: ["ignore","ignore","ignore"] })` + `unref()`；以 `.palace-state/digest.lock`（含 PID）防重入，lock 存在且 PID 存活則跳過
  - 環境開關：`PALACE_AUTO_DIGEST=1` 才啟用（預設關——headless 蒸餾消耗 token，使用者顯式開啟）

- [ ] **Step 1: 寫失敗測試**（lock 防重入邏輯，spawn 以 dep 注入 mock）

```ts
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldSpawnDigest } from "./autodigest";

test("無 lock 時可 spawn，lock 含存活 PID 時跳過", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  expect(shouldSpawnDigest(root)).toBe(true);
  writeFileSync(join(root, ".palace-state/digest.lock"), String(process.pid)); // 用本測試程序 PID 模擬存活
  expect(shouldSpawnDigest(root)).toBe(false);
});

test("lock 含死 PID 視為過期", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-"));
  writeFileSync(join(root, ".palace-state/digest.lock"), "999999");
  expect(shouldSpawnDigest(root)).toBe(true);
});
```
（注意：測試前需 `mkdirSync(join(root, ".palace-state"), { recursive: true })`——實作 `shouldSpawnDigest` 內建立亦可）

- [ ] **Step 2-4: TDD 循環**（失敗 → 實作 `shouldSpawnDigest`/`spawnAutoDigest` → 通過），sessionend.ts 尾端加：
```ts
if (process.env.PALACE_AUTO_DIGEST === "1" && shouldSpawnDigest(repoRoot())) spawnAutoDigest(repoRoot());
```

- [ ] **Step 5: Commit**

```bash
git add tools/lib/autodigest.ts tools/lib/autodigest.test.ts tools/hooks/sessionend.ts
git commit -m "feat: SessionEnd 自動蒸餾（headless、lock 防重入、預設關閉）"
```

### Task 21: MCP server（list / search / read / wake）

**Files:**
- Create: `tools/mcp/server.ts`, `tools/mcp/server.test.ts`

**Interfaces:**
- Consumes: `buildWakeBundle`（Task 12）；`@modelcontextprotocol/sdk`（`bun add @modelcontextprotocol/sdk zod`）
- Produces: stdio MCP server `palace-memory`，四個 tool：
  - `memory_list({ dir? })`：列 vault 目錄樹一層（name、type）
  - `memory_search({ query, limit? })`：對 vault .md 逐行大小寫不敏感搜尋，回 `file:line: snippet`（上限 limit ?? 20）
  - `memory_read({ path })`：讀單檔全文（路徑須在 vault 內——resolve 後 startsWith 檢查）
  - `memory_wake()`：回 wake bundle 文字
  - 純函式層（`listDir`/`searchVault`/`readNote`）與 MCP 接線分離，前者以 bun:test 測試

- [ ] **Step 1: 寫失敗測試**（純函式層：search 命中回 file:line、read 拒絕 vault 外路徑、list 列出子目錄）

```ts
import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchVault, readNote, listDir } from "./server";

const root = mkdtempSync(join(tmpdir(), "mcp-"));
mkdirSync(join(root, "projects"), { recursive: true });
writeFileSync(join(root, "projects/a.md"), "---\ntype: note\n---\n\n我喜歡 pnpm\n");

test("searchVault 回 file:line", () => {
  const hits = searchVault(root, "pnpm", 10);
  expect(hits[0]).toContain("projects/a.md:");
  expect(hits[0]).toContain("pnpm");
});

test("readNote 擋 vault 外路徑", () => {
  expect(() => readNote(root, "../etc/passwd")).toThrow();
  expect(readNote(root, "projects/a.md")).toContain("pnpm");
});

test("listDir 列子目錄與檔案", () => {
  expect(listDir(root, "")).toContain("projects/");
});
```

- [ ] **Step 2-4: TDD 循環**：實作純函式 → 通過 → 接 MCP（`McpServer` + `StdioServerTransport`，tool 定義用 zod schema，handler 呼叫純函式）→ 手動驗證：
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' | bun tools/mcp/server.ts | head -1
```
Expected: 回 initialize response JSON

- [ ] **Step 5: 註冊到 .mcp.json（repo 根）並寫入其他產品的掛載說明（放進 Phase 2 說明書）**

`.mcp.json`:
```json
{
  "mcpServers": {
    "palace-memory": {
      "command": "bun",
      "args": ["tools/mcp/server.ts"]
    }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add tools/mcp/ .mcp.json package.json bun.lock
git commit -m "feat: palace-memory MCP server——list/search/read/wake"
```

### Task 22: index 重生排程 + Phase 2 HTML 說明書

**Files:**
- Modify: `tools/hooks/sessionend.ts`（歸檔後同步跑 `regenerateIndexes`——Bun 內非 spawn，便宜）
- Create: `docs/manual/phase-2.html`

- [ ] **Step 1: sessionend 加 reindex**（import `regenerateIndexes`，在 archive 成功後呼叫，錯誤同樣 log 不擋）+ 測試（mock deps 確認 archive 成功才 reindex）

- [ ] **Step 2: Phase 2 說明書**

`docs/manual/phase-2.html` 必含：自動蒸餾如何開啟（`PALACE_AUTO_DIGEST=1`）與成本提醒、把記憶接到 Claude Desktop / Codex / Gemini CLI 的逐步掛載說明（MCP 設定截圖或文字步驟）、四個 memory 工具各自何時被 AI 使用、index 自動更新的行為、troubleshooting（lock 卡住、MCP 連不上）

- [ ] **Step 3: 端到端驗收**

```bash
bun test && bun run lint:vault
```
另：在 Claude Desktop 掛上 MCP 實測 `memory_wake` 與 `memory_search`

- [ ] **Step 4: Commit**

```bash
git add tools/hooks/sessionend.ts docs/manual/phase-2.html
git commit -m "feat: index 自動重生 + Phase 2 使用說明書"
```

---

## Branch 策略

- `main`：設計文件與計畫
- `phase-1`：自 main 分出，Tasks 1-19；完成後保留（不自動 merge，等使用者驗收）
- `phase-2`：自 phase-1 分出，Tasks 20-22

## 驗收總表（對照 spec §6）

| 驗收項 | 對應任務 |
|---|---|
| bun test 全綠（解析/雜訊/推導/sanitize 用 fixtures） | Tasks 2-5, 7-12, 14-17, 20-21 |
| hooks 前景 <500ms、PreCompact 同步有限 | Tasks 9-11（Bun 冷啟 + 純文字 render） |
| Wake ≤900 tokens lint 硬檢查 | Tasks 12, 16 |
| 端到端（歸檔→digest→wake→檢索） | Tasks 13, 19 |
| OKF conformance + Obsidian 渲染 | Tasks 6, 15, 16, 19 |
| 每階段 HTML 說明書 | Tasks 19, 22 |
