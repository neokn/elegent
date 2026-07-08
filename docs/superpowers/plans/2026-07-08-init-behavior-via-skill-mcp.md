# init 行為重構(vault 去 CLAUDE.md、skill+MCP 承載、分層記憶)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 `elgt init` 不再往使用者 vault 寫 agent 人設檔(`CLAUDE.md`/`AGENTS.md`),改由 skill(寫入/策展)+ MCP(查詢/定位)承載行為;新增 `local`/嵌入式 `project` scope 與分層記憶查詢。

**Architecture:** 依 Explicit Architecture 三區塊(core/presentation/infrastructure)。純邏輯(命名、合併、模板)放 `core`,經 port 做 I/O;MCP 註冊走新 `McpRegistrar` port + infra adapter;MCP server(presentation)服務多個 vault root 並自動探測嵌入 vault。

**Tech Stack:** Bun + TypeScript;`bun test`(bun:test)、`bun run build`;MCP `@modelcontextprotocol/sdk`;官方 `claude`/`codex` CLI 的 `mcp add`。

## Global Constraints

- 依賴一律向內:`presentation → core ← infrastructure`;`core` 不得 import presentation/infrastructure,不得碰 `node:fs`/`node:os`/`Bun.spawn`(`node:path` 純字串運算允許)。跨 block 走 `@core/*`/`@presentation/*`/`@infrastructure/*` 別名。由 `src/architecture.test.ts` 強制。
- I/O 一律經 port(`FileStore`/`GitRunner`/新 `McpRegistrar`),由 presentation 組裝根注入 infra 實作。
- 全程冪等:同 targetDir 重跑,`created` 穩定、既有檔內容不變、MCP 不重複註冊、`.gitignore` 不重複 append。
- vault frontmatter `type` 封閉詞彙表:`note|moc|entity|raw-log|wake|daily`(不得發明新 type)。
- 測試框架 `bun test`;每個任務結束跑對應測試綠燈後 commit。
- 本 repo 自己的根 `CLAUDE.md`/`AGENTS.md`(開發用)**不得更動**。
- **commit 只用精確 `git add <本任務的檔案路徑>`;嚴禁 `git add -A`/`git add .`**——工作區存在與本重構無關的未提交變更(`docs/architecture/*.md`、`.agents/`、`.gemini/`),掃進 commit 會污染。
- 設計來源:`docs/superpowers/specs/2026-07-08-init-behavior-via-skill-mcp-design.md`。

---

## 檔案結構(建立/修改與職責)

**新增**
- `src/core/application/config-merge.ts` — 冪等加值式合併 Claude/Codex hooks 設定(純函式)。
- `src/core/application/vault-naming.ts` — 依 scope 推導 vault mode 與 vault 目錄名(純函式)。
- `src/assets/codex-mcp.tmpl` — Codex project/local 的 `config.toml` `[mcp_servers]` 片段模板。
- `src/infrastructure/adapters/agent-cli.ts` — `McpRegistrar` 的 `Bun.spawn` 實作(claude/codex CLI)。
- 各對應 `*.test.ts`。

**修改**
- `src/core/ports.ts` — 加 `McpRegistrar`、`McpRegisterOpts`。
- `src/core/application/templates.ts` — 移除 `claude-md`/`mcp-json`,加 `codex-mcp` 與 `renderCodexMcpToml`。
- `src/core/application/bootstrap.ts` — 主整合(去人設檔、hooks 合併、vault 命名、條件 MCP 註冊、預設 user)。
- `src/presentation/mcp/server.ts` — `instructions` + 多 root 查詢 + 自動探測。
- `src/presentation/cli/elgt.ts` — scope 驗證、預設、USAGE、init 訊息、注入 registrar。
- `src/presentation/cli/init-ui.tsx` — 加 `local` 選項、預設 user。
- `src/assets/skill-digest.md` — 自我完備(去 CLAUDE.md 依賴、內嵌格式鐵律)。
- `/.mcp.json`(dogfood 修復)、根 `CLAUDE.md`(src/assets 清單)、`docs/manual/index.html`。

**刪除**
- `src/assets/claude-md.md`、`src/assets/mcp-json.tmpl`。

---

## Task 1: digest skill 自我完備(去 CLAUDE.md 依賴、內嵌格式鐵律)

**Files:**
- Modify: `src/assets/skill-digest.md`
- Test: `src/core/application/templates.test.ts`(`describe("skill-digest 模板")` 區塊)

**Interfaces:**
- Consumes: 無。
- Produces: 無新程式介面;`skill-digest.md` 之後不再出現字串 `CLAUDE.md`/`AGENTS.md`,改內嵌格式鐵律。

- [ ] **Step 1: 改測試預期(先讓它失敗)** — 編輯 `templates.test.ts` 的 `describe("skill-digest 模板")` 內第二個 test,移除 `CLAUDE.md`/`AGENTS.md` 斷言,改斷言自足內容:

```ts
  test("guard/reindex/lint 指令自足、內嵌格式鐵律、不再引用 CLAUDE.md/AGENTS.md", () => {
    const out = renderTemplate("skill-digest", VARS);
    expect(out).toContain("elgt guard <該檔路徑>");
    expect(out).toContain("elgt reindex");
    expect(out).toContain("elgt lint");
    // 自足:不再把規範外包給 CLAUDE.md/AGENTS.md
    expect(out).not.toContain("CLAUDE.md");
    expect(out).not.toContain("AGENTS.md");
    // 內嵌格式鐵律(從舊 claude-md 搬入)
    expect(out).toContain("note|moc|entity|raw-log|wake|daily");
    expect(out).toContain("## Facts");
  });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test src/core/application/templates.test.ts`
Expected: FAIL（`skill-digest` 目前含 `CLAUDE.md`/`AGENTS.md`、且無 type 詞彙表）

- [ ] **Step 3: 改 `src/assets/skill-digest.md`** — 三處修改:
  1. 第 19 行「完整規範見 CLAUDE.md 與設計文件 §3.2」→ 改為內嵌欄位表;把 `type` 詞彙表寫出。
  2. 第 23 行「立刻依 `CLAUDE.md` / `AGENTS.md` 的工具指令執行 `elgt guard <該檔路徑>`」→「立刻執行 `elgt guard <該檔路徑>`」。
  3. 第 31、32 行「依 `CLAUDE.md` / `AGENTS.md` 的工具指令執行 `elgt reindex`/`elgt lint`」→「執行 `elgt reindex`」「執行 `elgt lint`」。
  於檔尾「禁止事項」前，新增「## 格式鐵律」小節：

```markdown
## 格式鐵律（寫入時必守）

- 每個非保留 `.md` 必有 frontmatter，`type` ∈ `note|moc|entity|raw-log|wake|daily`。
- frontmatter 欄位：`type`/`title`/`description`/`tags`/`timestamp`/`date`/`aliases`/`source`/`user_managed`。
- 內部連結一律 `[標題](相對路徑.md)`；禁 `[[wikilink]]`、`![[embed]]`。
- 檔名 = 唯一 slug（小寫、`-`）；人味放 `title`/`aliases`。
- entity 頁固定槽位：`## Facts`（時間性事實表：舊事實填 `valid_to` 作廢，絕不刪列）+ `## Links` + `## Citations`。
- `index.md` 是生成物（`elgt reindex`），不要手改；`user_managed: true` 的檔只讀。
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test src/core/application/templates.test.ts`
Expected: PASS（含防漂移 test：`.claude/skills/digest/SKILL.md` 為 symlink → 同一份 asset，自動一致）

- [ ] **Step 5: Commit**

```bash
git add src/assets/skill-digest.md src/core/application/templates.test.ts
git commit -m "refactor(skill): digest skill 自我完備，內嵌格式鐵律、去除 CLAUDE.md 依賴"
```

---

## Task 2: MCP server instructions(定位 + 檢索 SOP)

**Files:**
- Modify: `src/presentation/mcp/server.ts:15`(`SERVER_INFO` 附近加常數)、`server.ts:103`(`new McpServer`)
- Test: `src/presentation/mcp/server.test.ts`

**Interfaces:**
- Consumes: 無。
- Produces: `export const VAULT_INSTRUCTIONS: string`(server.ts）。

- [ ] **Step 1: 寫失敗測試** — 在 `server.test.ts` 末尾加:

```ts
import { VAULT_INSTRUCTIONS } from "@presentation/mcp/server";

test("VAULT_INSTRUCTIONS：非空、含檢索 SOP 與分層說明關鍵字", () => {
  expect(VAULT_INSTRUCTIONS.length).toBeGreaterThan(50);
  expect(VAULT_INSTRUCTIONS).toContain("memory_wake");
  expect(VAULT_INSTRUCTIONS).toContain("memory_search");
  expect(VAULT_INSTRUCTIONS).toContain("/digest");
  expect(VAULT_INSTRUCTIONS).toContain("[vault]");
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test src/presentation/mcp/server.test.ts`
Expected: FAIL（`VAULT_INSTRUCTIONS` 未匯出）

- [ ] **Step 3: 加常數並傳入 McpServer** — 在 `server.ts` `SERVER_INFO` 定義後加:

```ts
export const VAULT_INSTRUCTIONS = `這是 EleGent 個人記憶 vault（雙受眾 markdown）。projects/areas/resources/archives = PARA（給人）；palace/ = 記憶宮殿（給 LLM）。可能同時掛載多個 vault（全域 + 專案），搜尋結果會以 [vault] 前綴標註來源。

查詢「我記得…嗎」SOP：
1. 先 memory_wake 拿 identity + 當前要事；或 memory_read \`palace/map.md\` 定位。
2. memory_search 多路查詢：原句 + 同義詞 + 上位概念（查一次不夠）。
3. 只 memory_read 命中的檔；需要證據追到 palace/raw/ 逐字紀錄。
4. 有價值的綜合值得回填——請使用者觸發 /digest 依寫入契約寫回 PARA。

不要自己改檔：寫入一律走 /digest skill。index.md 是生成物（elgt reindex），別手改。`;
```

  並把 `server.ts:103` 的 `const server = new McpServer(SERVER_INFO);` 改為:

```ts
  const server = new McpServer(SERVER_INFO, { instructions: VAULT_INSTRUCTIONS });
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test src/presentation/mcp/server.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/presentation/mcp/server.ts src/presentation/mcp/server.test.ts
git commit -m "feat(mcp): server instructions 帶 vault 定位與檢索 SOP"
```

---

## Task 3: config-merge 純函式(冪等合併 hooks)

**Files:**
- Create: `src/core/application/config-merge.ts`
- Test: `src/core/application/config-merge.test.ts`

**Interfaces:**
- Consumes: 無。
- Produces:
  - `mergeClaudeSettings(existing: string | null, opts: { hookCommand: string; bashAllow: string }): string`
  - `mergeCodexHooks(existing: string | null, opts: { hookCommand: string }): string`
  - 兩者:`existing` 為 null 產全新檔;否則保留既有內容、只加缺的 hook 條目(以 command 字串去重)。JSON 無法 parse → **throw**（呼叫端 catch 後保留原檔 + 警告）。

- [ ] **Step 1: 寫失敗測試** — `config-merge.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mergeClaudeSettings, mergeCodexHooks } from "@core/application/config-merge";

const CLAUDE = { hookCommand: "/bin/elgt", bashAllow: "/bin/elgt" };

test("Claude：空輸入 → 四事件齊全 + permissions.allow", () => {
  const out = JSON.parse(mergeClaudeSettings(null, CLAUDE));
  expect(Object.keys(out.hooks).sort()).toEqual(["PreCompact", "SessionEnd", "SessionStart", "Stop"].sort());
  expect(out.hooks.Stop[0].hooks[0].command).toBe("/bin/elgt hook claude stop");
  expect(out.permissions.allow).toContain("Bash(/bin/elgt:*)");
});

test("Claude：既有他人 hook 與設定被保留，我方條目加上", () => {
  const existing = JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: "command", command: "other-tool" }] }] },
    permissions: { allow: ["Bash(git:*)"] },
    model: "sonnet",
  });
  const out = JSON.parse(mergeClaudeSettings(existing, CLAUDE));
  expect(out.model).toBe("sonnet");
  expect(out.permissions.allow).toEqual(["Bash(git:*)", "Bash(/bin/elgt:*)"]);
  const cmds = out.hooks.Stop.flatMap((g: any) => g.hooks.map((h: any) => h.command));
  expect(cmds).toContain("other-tool");
  expect(cmds).toContain("/bin/elgt hook claude stop");
});

test("Claude：重跑冪等——第二次不重複加", () => {
  const once = mergeClaudeSettings(null, CLAUDE);
  const twice = mergeClaudeSettings(once, CLAUDE);
  expect(twice).toBe(once);
});

test("Claude：壞 JSON → throw", () => {
  expect(() => mergeClaudeSettings("{not json", CLAUDE)).toThrow();
});

test("Codex：空輸入 → Stop/PreCompact 齊全、含 statusMessage/timeout", () => {
  const out = JSON.parse(mergeCodexHooks(null, { hookCommand: "/bin/elgt" }));
  expect(Object.keys(out.hooks).sort()).toEqual(["PreCompact", "Stop"].sort());
  expect(out.hooks.Stop[0].hooks[0].command).toBe("/bin/elgt hook codex stop");
  expect(out.hooks.Stop[0].hooks[0].timeout).toBe(30);
});

test("Codex：重跑冪等", () => {
  const once = mergeCodexHooks(null, { hookCommand: "/bin/elgt" });
  expect(mergeCodexHooks(once, { hookCommand: "/bin/elgt" })).toBe(once);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test src/core/application/config-merge.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 `config-merge.ts`**

```ts
/**
 * 冪等加值式合併 agent CLI 的 hooks 設定：existing=null 產全新檔；否則保留既有內容，
 * 只補上缺的 hook 條目（以 command 字串去重）與 permissions.allow 項。只增不改不刪。
 * JSON parse 失敗直接 throw——呼叫端負責 catch 後保留原檔並發警告（不覆寫使用者設定）。
 */

const CLAUDE_EVENTS = ["Stop", "PreCompact", "SessionEnd", "SessionStart"] as const;
const CODEX_EVENTS = ["Stop", "PreCompact"] as const;

interface HookEntry { type: "command"; command: string; [k: string]: unknown; }
interface HookGroup { hooks?: HookEntry[]; [k: string]: unknown; }
interface Settings { hooks?: Record<string, HookGroup[]>; permissions?: { allow?: string[]; [k: string]: unknown }; [k: string]: unknown; }

function ensureHook(hooks: Record<string, HookGroup[]>, event: string, entry: HookEntry): void {
  const groups = (hooks[event] ??= []);
  const present = groups.some((g) => (g.hooks ?? []).some((h) => h.command === entry.command));
  if (!present) groups.push({ hooks: [entry] });
}

export function mergeClaudeSettings(existing: string | null, opts: { hookCommand: string; bashAllow: string }): string {
  const root: Settings = existing ? JSON.parse(existing) : {};
  root.hooks ??= {};
  for (const event of CLAUDE_EVENTS) {
    ensureHook(root.hooks, event, { type: "command", command: `${opts.hookCommand} hook claude ${event.toLowerCase()}` });
  }
  root.permissions ??= {};
  (root.permissions.allow ??= []);
  const allow = `Bash(${opts.bashAllow}:*)`;
  if (!root.permissions.allow.includes(allow)) root.permissions.allow.push(allow);
  return JSON.stringify(root, null, 2) + "\n";
}

export function mergeCodexHooks(existing: string | null, opts: { hookCommand: string }): string {
  const root: Settings = existing ? JSON.parse(existing) : {};
  root.hooks ??= {};
  for (const event of CODEX_EVENTS) {
    ensureHook(root.hooks, event, {
      type: "command",
      command: `${opts.hookCommand} hook codex ${event.toLowerCase()}`,
      statusMessage: "Archiving Codex conversation to EleGent",
      timeout: 30,
    });
  }
  return JSON.stringify(root, null, 2) + "\n";
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test src/core/application/config-merge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/application/config-merge.ts src/core/application/config-merge.test.ts
git commit -m "feat(core): config-merge 冪等加值式合併 Claude/Codex hooks"
```

---

## Task 4: vault-naming 純函式(scope → vault mode → 目錄名)

**Files:**
- Create: `src/core/application/vault-naming.ts`
- Test: `src/core/application/vault-naming.test.ts`

**Interfaces:**
- Consumes: `slugify`（`@core/domain/safety`）、`AgentConfigScope`（`@core/application/bootstrap`，type-only import，避免 runtime 循環）。
- Produces:
  - `type VaultMode = "standalone" | "project" | "local"`
  - `deriveVaultMode(claudeScope: AgentConfigScope, codexScope: AgentConfigScope): VaultMode`
  - `vaultDirName(mode: VaultMode, targetDir: string, vaultNameOpt?: string): string`
  - `resolveVaultDir(mode: VaultMode, targetDir: string, vaultNameOpt?: string): string`（回絕對路徑）

- [ ] **Step 1: 寫失敗測試** — `vault-naming.test.ts`:

```ts
import { expect, test } from "bun:test";
import { deriveVaultMode, vaultDirName, resolveVaultDir } from "@core/application/vault-naming";

test("deriveVaultMode：任一 local → local；任一 project → project；否則 standalone", () => {
  expect(deriveVaultMode("local", "none")).toBe("local");
  expect(deriveVaultMode("none", "local")).toBe("local");
  expect(deriveVaultMode("project", "user")).toBe("project");
  expect(deriveVaultMode("user", "none")).toBe("standalone");
  expect(deriveVaultMode("none", "none")).toBe("standalone");
});

test("vaultDirName：local 隱藏 + slug、project 可見 + slug（basename 剝點）", () => {
  expect(vaultDirName("local", "/x/My App")).toBe(".my-app.vault");
  expect(vaultDirName("project", "/x/My App")).toBe("my-app.vault");
  expect(vaultDirName("local", "/x/.config")).toBe(".config.vault");
  expect(vaultDirName("project", "/x/.config")).toBe("config.vault");
});

test("vaultDirName：standalone 用 vaultName（預設 vault）", () => {
  expect(vaultDirName("standalone", "/x/whatever")).toBe("vault");
  expect(vaultDirName("standalone", "/x/whatever", "my memory")).toBe("my-memory");
});

test("vaultDirName：basename 退化（空 slug）→ project vault / local .vault", () => {
  expect(vaultDirName("project", "/")).toBe("vault");
  expect(vaultDirName("local", "/")).toBe(".vault");
});

test("resolveVaultDir：回絕對路徑（join targetDir）", () => {
  expect(resolveVaultDir("local", "/x/app")).toBe("/x/app/.app.vault");
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test src/core/application/vault-naming.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 `vault-naming.ts`**

```ts
import { basename, join } from "node:path";
import { slugify } from "@core/domain/safety";
import type { AgentConfigScope } from "@core/application/bootstrap";

export type VaultMode = "standalone" | "project" | "local";

/**
 * vault 放置模式由兩個 agent scope 推導（§4.9 已保證不會出現 local+project 混用）：
 * 任一 local → 嵌入隱藏；任一 project → 嵌入可見；否則（user/none）→ 使用者命名的獨立 vault。
 */
export function deriveVaultMode(claudeScope: AgentConfigScope, codexScope: AgentConfigScope): VaultMode {
  if (claudeScope === "local" || codexScope === "local") return "local";
  if (claudeScope === "project" || codexScope === "project") return "project";
  return "standalone";
}

/** vault 目錄名（相對 targetDir）。slugify 已移除所有點，故 base 天然無開頭點。 */
export function vaultDirName(mode: VaultMode, targetDir: string, vaultNameOpt?: string): string {
  if (mode === "standalone") return slugify(vaultNameOpt?.trim() || "vault") || "vault";
  const base = slugify(basename(targetDir));
  if (mode === "local") return base ? `.${base}.vault` : ".vault";
  return base ? `${base}.vault` : "vault"; // project
}

export function resolveVaultDir(mode: VaultMode, targetDir: string, vaultNameOpt?: string): string {
  return join(targetDir, vaultDirName(mode, targetDir, vaultNameOpt));
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test src/core/application/vault-naming.test.ts && bun test src/architecture.test.ts`
Expected: PASS（architecture.test 確認 core 未碰 fs/os;`node:path` 允許）

- [ ] **Step 5: Commit**

```bash
git add src/core/application/vault-naming.ts src/core/application/vault-naming.test.ts
git commit -m "feat(core): vault-naming 依 scope 推導 vault mode 與嵌入式命名"
```

---

## Task 5: McpRegistrar port + agent-cli adapter

**Files:**
- Modify: `src/core/ports.ts`（加介面）
- Create: `src/infrastructure/adapters/agent-cli.ts`
- Test: `src/infrastructure/adapters/agent-cli.test.ts`（僅測 arg 組裝純函式;不呼叫真 CLI）

**Interfaces:**
- Consumes: 無。
- Produces（`ports.ts`）:

```ts
export interface McpRegisterOpts {
  scope: "project" | "user" | "local";
  vaultRoot: string;   // 絕對路徑；--env ELEGENT_VAULT=
  elegentBin: string;  // 可能兩段（"bun /abs/elgt.ts"）
  cwd: string;         // 執行 CLI 的工作目錄（project/local = targetDir）
}
export interface McpRegistrar {
  claudeUserServerExists(): boolean;
  codexUserServerExists(): boolean;
  registerClaude(opts: McpRegisterOpts): { ok: boolean; detail: string };
  registerCodex(opts: McpRegisterOpts): { ok: boolean; detail: string };
}
```
  - `agent-cli.ts` 另 export 純函式 `claudeMcpAddArgs(opts)`、`codexMcpAddArgs(opts)` 供單測。

- [ ] **Step 1: 加 port 型別** — 在 `src/core/ports.ts` 末尾加上上述 `McpRegisterOpts` 與 `McpRegistrar`(含 doc comment:「用官方 CLI 註冊 MCP;`*UserServerExists` 供條件註冊判斷,實作在 infrastructure」)。

- [ ] **Step 2: 寫失敗測試** — `agent-cli.test.ts`:

```ts
import { expect, test } from "bun:test";
import { claudeMcpAddArgs, codexMcpAddArgs } from "@infrastructure/adapters/agent-cli";

const base = { scope: "user" as const, vaultRoot: "/v", cwd: "/c" };

test("claude：flag 在 name 前，-- 後接 bin 與 mcp（單段 bin）", () => {
  expect(claudeMcpAddArgs({ ...base, elegentBin: "/bin/elgt" })).toEqual([
    "mcp", "add", "--scope", "user", "--env", "ELEGENT_VAULT=/v",
    "elegent-memory", "--", "/bin/elgt", "mcp",
  ]);
});

test("claude：兩段 bin（bun /abs/elgt.ts）正確拆到 -- 之後", () => {
  expect(claudeMcpAddArgs({ ...base, scope: "local", elegentBin: "bun /abs/elgt.ts" })).toEqual([
    "mcp", "add", "--scope", "local", "--env", "ELEGENT_VAULT=/v",
    "elegent-memory", "--", "bun", "/abs/elgt.ts", "mcp",
  ]);
});

test("codex：name 在 flag 前，-- 後接 bin 與 mcp", () => {
  expect(codexMcpAddArgs({ ...base, elegentBin: "/bin/elgt" })).toEqual([
    "mcp", "add", "elegent-memory", "--env", "ELEGENT_VAULT=/v",
    "--", "/bin/elgt", "mcp",
  ]);
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `bun test src/infrastructure/adapters/agent-cli.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 4: 實作 `agent-cli.ts`**

```ts
import type { McpRegistrar, McpRegisterOpts } from "@core/ports";

const SERVER = "elegent-memory";
const binParts = (bin: string): string[] => bin.split(" ").filter(Boolean);

/** claude mcp add：所有 flag（--scope/--env）須在 server name 之前，-- 之後為 stdio 指令。 */
export function claudeMcpAddArgs(opts: McpRegisterOpts): string[] {
  return ["mcp", "add", "--scope", opts.scope, "--env", `ELEGENT_VAULT=${opts.vaultRoot}`,
    SERVER, "--", ...binParts(opts.elegentBin), "mcp"];
}

/** codex mcp add：name 在前，--env 次之，-- 之後為 stdio 指令（Codex 無 scope flag，一律寫 user config）。 */
export function codexMcpAddArgs(opts: McpRegisterOpts): string[] {
  return ["mcp", "add", SERVER, "--env", `ELEGENT_VAULT=${opts.vaultRoot}`,
    "--", ...binParts(opts.elegentBin), "mcp"];
}

function run(cmd: string, args: string[], cwd: string): { ok: boolean; detail: string } {
  try {
    const r = Bun.spawnSync([cmd, ...args], { cwd, env: process.env });
    const stderr = r.stderr?.toString() ?? "";
    // 已存在視為成功（冪等）。
    if (r.exitCode !== 0 && /already exist/i.test(stderr)) return { ok: true, detail: "already registered" };
    return { ok: r.exitCode === 0, detail: stderr.trim() || `exit ${r.exitCode}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function serverListed(cmd: string): boolean {
  try {
    const r = Bun.spawnSync([cmd, "mcp", "get", SERVER], { env: process.env });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

export const agentCliRegistrar: McpRegistrar = {
  claudeUserServerExists: () => serverListed("claude"),
  codexUserServerExists: () => serverListed("codex"),
  registerClaude: (opts) => run("claude", claudeMcpAddArgs(opts), opts.cwd),
  registerCodex: (opts) => run("codex", codexMcpAddArgs(opts), opts.cwd),
};
```

- [ ] **Step 5: 跑測試確認通過**

Run: `bun test src/infrastructure/adapters/agent-cli.test.ts && bun test src/architecture.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/ports.ts src/infrastructure/adapters/agent-cli.ts src/infrastructure/adapters/agent-cli.test.ts
git commit -m "feat: McpRegistrar port 與 agent-cli adapter（claude/codex mcp add）"
```

---

## Task 6: codex-mcp 模板 + renderCodexMcpToml

**Files:**
- Create: `src/assets/codex-mcp.tmpl`
- Modify: `src/core/application/templates.ts`
- Test: `src/core/application/templates.test.ts`

**Interfaces:**
- Consumes: 無。
- Produces: `renderCodexMcpToml(elegentBin: string, vaultRoot: string): string`（`templates.ts` 匯出）。

- [ ] **Step 1: 建模板 `src/assets/codex-mcp.tmpl`**

```toml
[mcp_servers.elegent-memory]
command = "{{ELEGENT_MCP_COMMAND}}"
args = [{{ELEGENT_MCP_ARGS}}]

[mcp_servers.elegent-memory.env]
ELEGENT_VAULT = "{{ELEGENT_VAULT}}"
```

- [ ] **Step 2: 寫失敗測試** — 在 `templates.test.ts` 加:

```ts
import { renderCodexMcpToml } from "@core/application/templates";

describe("renderCodexMcpToml", () => {
  test("單段 bin：command 原樣、args 只有 mcp", () => {
    const out = renderCodexMcpToml("/bin/elgt", "/v");
    expect(out).toContain('command = "/bin/elgt"');
    expect(out).toContain('args = ["mcp"]');
    expect(out).toContain('ELEGENT_VAULT = "/v"');
    expect(out).not.toContain("{{");
  });
  test("兩段 bin：command=bun、args 前面接上 elgt.ts 路徑", () => {
    const out = renderCodexMcpToml("bun /abs/elgt.ts", "/v");
    expect(out).toContain('command = "bun"');
    expect(out).toContain('args = ["/abs/elgt.ts", "mcp"]');
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `bun test src/core/application/templates.test.ts`
Expected: FAIL（`renderCodexMcpToml` 未匯出）

- [ ] **Step 4: 實作** — `templates.ts`:先加 import 與 `TemplateName`(此步同時做 Task 7 會移除的 claude-md/mcp-json?否——本步只**加** codex-mcp,移除留給 Task 7,以免破壞尚存的引用)。在檔頂加 `import codexMcp from "../../assets/codex-mcp.tmpl" with { type: "text" };`;`TemplateName` union 加 `"codex-mcp"`;`TEMPLATES` map 加 `"codex-mcp": codexMcp`。並加函式:

```ts
/** Codex config.toml 的 [mcp_servers.elegent-memory] 片段。elegentBin 兩段時 command=首段、其餘接進 args。 */
export function renderCodexMcpToml(elegentBin: string, vaultRoot: string): string {
  const parts = elegentBin.split(" ").filter(Boolean);
  const [command, ...rest] = parts;
  const args = [...rest, "mcp"].map((a) => JSON.stringify(a)).join(", ");
  return renderTemplate("codex-mcp", { ELEGENT_BIN: elegentBin })
    .replaceAll("{{ELEGENT_MCP_COMMAND}}", command)
    .replaceAll("{{ELEGENT_MCP_ARGS}}", args)
    .replaceAll("{{ELEGENT_VAULT}}", vaultRoot);
}
```

  註:`renderTemplate` 會把 `{{ELEGENT_BIN}}` 換掉(模板無此佔位,no-op),再由本函式換三個專屬佔位符。ALL_NAMES(templates.test.ts:9)暫時**先不改**(Task 7 統一調整),但新增的 `codex-mcp` 會讓通用防漂移迴圈涵蓋它——故確保模板 render 後無 `{{` 殘留:通用迴圈用的 `VARS` 只有 `ELEGENT_BIN`,`codex-mcp` 會殘留 `{{ELEGENT_MCP_*}}`。**因此**:通用防漂移迴圈 `ALL_NAMES` 這步就要把 `codex-mcp` 排除(它需專屬 render 函式),於 `ALL_NAMES` 保持不含 `codex-mcp`,改在上面的 `describe("renderCodexMcpToml")` 專測其無 `{{` 殘留。

- [ ] **Step 5: 跑測試確認通過**

Run: `bun test src/core/application/templates.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/assets/codex-mcp.tmpl src/core/application/templates.ts src/core/application/templates.test.ts
git commit -m "feat(templates): codex-mcp 模板與 renderCodexMcpToml"
```

---

## Task 7: bootstrap 去人設檔 + 清除 mcp-json(A + F 模板/enum)

**Files:**
- Delete: `src/assets/claude-md.md`、`src/assets/mcp-json.tmpl`
- Modify: `src/core/application/templates.ts`、`src/core/application/bootstrap.ts`
- Test: `src/core/application/templates.test.ts`、`src/core/application/bootstrap.test.ts`

**Interfaces:**
- Consumes: Task 6 的 `TemplateName`。
- Produces: `bootstrap` 不再產出 `CLAUDE.md`/`AGENTS.md`/`.mcp.json`;`TemplateName` = `"skill-digest" | "settings-json" | "gitignore" | "codex-hooks" | "codex-mcp"`。

- [ ] **Step 1: 改 templates.test.ts（先失敗）** — `ALL_NAMES`(第 9 行)改為 `["skill-digest", "settings-json", "gitignore", "codex-hooks"]`(移除 `claude-md`、`mcp-json`;`codex-mcp` 本就不在通用迴圈);刪除 `describe("claude-md 模板")` 與 `describe("mcp-json 模板")` 兩個區塊;刪除 `test("renderTemplate：ELEGENT_BIN 實際被替換…")` 中對 `claude-md` 的引用(改用 `settings-json`:`expect(renderTemplate("settings-json", VARS)).toContain("./elgt hook")`）。

- [ ] **Step 2: 改 bootstrap.test.ts（先失敗）** — 重寫斷言:
  - **先加一個 `boot()` test helper**(供本任務與 Task 8-10 共用,把 `bootstrap` 的固定參數收斂到一處——之後 Task 10 為 `bootstrap` 加 registrar 參數時,只需改這個 helper 一行,不必逐一改各測試):

```ts
// 放在 bootstrap.test.ts 檔頂 import 之後、第一個 test 之前
function boot(dir: string, opts: Parameters<typeof bootstrap>[4] = {}) {
  return bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN, opts);
}
```

  - 把檔內所有 `bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN, ...)` 呼叫改為 `boot(dir, ...)`(含只帶預設參數的 `bootstrap(nodeFileStore, nodeGitRunner, dir, ELEGENT_BIN)` → `boot(dir)`;帶 `ELEGENT_BIN` 以外自訂 bin 的兩個測試維持直接呼叫或另寫 helper)。
  - `RENDERED_RELPATHS`(第 12 行)改為 `[".claude/settings.json", ".claude/skills/digest/SKILL.md", ".gitignore"]`（移除 `CLAUDE.md`、`.mcp.json`）。
  - 刪除測試:`"多 agent context：AGENTS.md…symlink"`、`"既有 AGENTS.md…不被覆寫"`、`"既有 CLAUDE.md…不被覆寫"`、兩個 `.mcp.json` exec/bin 測試、`"自訂 vaultName…"`中 `.mcp.json` 斷言那兩行。
  - 於首個測試加:`expect(existsSync(join(dir, "CLAUDE.md"))).toBe(false); expect(existsSync(join(dir, "AGENTS.md"))).toBe(false); expect(existsSync(join(dir, ".mcp.json"))).toBe(false);`
  - `"agent scope none"` 測試中 `expect(existsSync(join(dir, "CLAUDE.md"))).toBe(true)` → 改 `toBe(false)`。
  - `"二次執行"` 測試改用 `.gitignore` 取代 `CLAUDE.md` 做「內容不變」比對。
  - 註:此任務 `bootstrap` 簽名尚未變（仍 5 參數）;`boot()` 現為 5 參數包裝。Task 10 才把 registrar 併入簽名與 `boot()`。

- [ ] **Step 3: 跑測試確認失敗**

Run: `bun test src/core/application/bootstrap.test.ts src/core/application/templates.test.ts`
Expected: FAIL（bootstrap 仍產出 CLAUDE.md/.mcp.json）

- [ ] **Step 4: 改 templates.ts** — 移除 `import claudeMd …`、`import mcpJson …`;`TemplateName` 移除 `"claude-md"`、`"mcp-json"`;`TEMPLATES` map 移除兩項。

- [ ] **Step 5: 改 bootstrap.ts** — 移除人設檔與 mcp-json:
  - `ROOT_RENDERED_FILES`(第 32-36 行)只留 `{ rel: ".gitignore", template: "gitignore" }`。
  - 刪除 `CONTEXT_SYMLINKS`(第 44-46 行)與其下 symlink 迴圈(第 166-182 行)、以及 `normalizeMcpJson`(第 55-68 行)與其呼叫(第 161 行 `if (template === "mcp-json") …`)。
  - 移除 `import` 中不再使用者(若 `slugify` 仍被 `normalizeVaultName` 用則保留)。

- [ ] **Step 6: 刪除模板檔**

```bash
git rm src/assets/claude-md.md src/assets/mcp-json.tmpl
```

- [ ] **Step 7: 跑測試確認通過**

Run: `bun test src/core/application/bootstrap.test.ts src/core/application/templates.test.ts src/architecture.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
# git rm（Step 6）已 stage 兩個刪除；這裡只 add 本任務改到的檔（禁用 git add -A：工作區有無關 WIP）
git add src/core/application/templates.ts src/core/application/bootstrap.ts \
  src/core/application/bootstrap.test.ts src/core/application/templates.test.ts
git commit -m "refactor(init): 移除 vault CLAUDE.md/AGENTS.md 與 .mcp.json 模板"
```

---

## Task 8: bootstrap hooks 改走冪等合併

**Files:**
- Modify: `src/core/application/bootstrap.ts`
- Test: `src/core/application/bootstrap.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `mergeClaudeSettings`/`mergeCodexHooks`;`FileStore.tryRead`;Task 7 已在 bootstrap.test.ts 定義的 `boot(dir, opts)` helper。
- Produces: `bootstrap` 對 settings.json/hooks.json 由「skip-if-exists 寫入」改為「tryRead → merge → write」。

- [ ] **Step 1: 寫失敗測試** — 在 bootstrap.test.ts 加(user scope 合併既有檔):

```ts
test("user scope：既有 ~/.claude/settings.json 被合併保留、加上我方 hook", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-merge-"));
  const userRoot = mkdtempSync(join(tmpdir(), "elgt-merge-user-"));
  const claudeUserDir = join(userRoot, ".claude");
  mkdirSync(claudeUserDir, { recursive: true });
  writeFileSync(join(claudeUserDir, "settings.json"), JSON.stringify({ model: "sonnet" }));

  boot(dir, { claudeScope: "user", codexScope: "none", claudeUserDir });

  const s = JSON.parse(readFileSync(join(claudeUserDir, "settings.json"), "utf8"));
  expect(s.model).toBe("sonnet");
  expect(s.hooks.Stop[0].hooks[0].command).toContain("hook claude stop");
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test src/core/application/bootstrap.test.ts -t "被合併保留"`
Expected: FAIL（既有檔被 skip、未合併）

- [ ] **Step 3: 改 bootstrap.ts** — 把 settings.json/hooks.json 從 `renderedFiles` 的通用「skip-if-exists 寫入」抽出,改用合併。在 `bootstrap` 內、寫檔迴圈處理完 skill 與 gitignore 後,對 hooks 檔:

```ts
import { mergeClaudeSettings, mergeCodexHooks } from "@core/application/config-merge";

function mergeWrite(store: FileStore, path: string, merge: (existing: string | null) => string, warnings: string[], created: string[], label: string): void {
  try {
    const existing = store.tryRead(path);
    const content = merge(existing);
    if (existing === null) created.push(path);
    store.write(path, content);
  } catch (e) {
    warnings.push(`合併 ${label} 失敗，保留原檔：${e instanceof Error ? e.message : String(e)}`);
  }
}
```

  在 `renderedFiles`/寫檔流程裡,將 `settings.json`(Claude)與 `hooks.json`(Codex)兩類**改由 `mergeWrite` 產生**(不再走 `renderTemplate("settings-json"/"codex-hooks")` 的 skip-if-exists 分支);hook command 沿用既有 `hookCommand`(user/local 帶 `ELEGENT_ROOT`+`ELEGENT_VAULT_NAME`、project 為 `elegentBin`),`bashAllow` 沿用既有邏輯。skill(`skills/digest/SKILL.md`)維持 skip-if-exists 寫入。settings-json/codex-hooks 模板保留供防漂移測試,但 bootstrap 不再用它們寫檔(改用 merge 函式產生等價內容)。

  註:此步後 `settings-json`/`codex-hooks` 模板僅剩 templates.test.ts 的防漂移測試在用。保留無妨(單一真理源改為 merge 函式的輸出);merge 產生的 JSON 與模板結構等價(事件、command、permissions、statusMessage/timeout 一致)。

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test src/core/application/bootstrap.test.ts`
Expected: PASS（含既有的 user scope、none scope、二次執行冪等測試）

- [ ] **Step 5: Commit**

```bash
git add src/core/application/bootstrap.ts src/core/application/bootstrap.test.ts
git commit -m "refactor(init): hooks 設定改為冪等加值式合併（user scope 不再空操作）"
```

---

## Task 9: bootstrap 嵌入式 vault + local gitignore + 預設 scope user + 混用驗證

**Files:**
- Modify: `src/core/application/bootstrap.ts`
- Test: `src/core/application/bootstrap.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `deriveVaultMode`/`resolveVaultDir`/`vaultDirName`;Task 7 的 `boot()` helper。
- Produces: `bootstrap` 依 scope 決定 vault 位置;local 把 vault 加進 `<targetDir>/.gitignore`;預設 scope = `user`;`local+project` 混用時 bootstrap 拋 `Error`(第二道防線,CLI 旗標層的驗證在 Task 12)。

- [ ] **Step 1: 寫失敗測試**:

```ts
import { relative } from "node:path";

test("local scope：建 .<slug>.vault、加入 .gitignore、Claude hooks 進 settings.local.json", () => {
  const parent = mkdtempSync(join(tmpdir(), "elgt-local-"));
  const dir = join(parent, "my-app");
  mkdirSync(dir);
  boot(dir, { claudeScope: "local", codexScope: "none" });
  expect(existsSync(join(dir, ".my-app.vault/palace/wake/identity.md"))).toBe(true);
  expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain(".my-app.vault/");
  expect(existsSync(join(dir, ".claude/settings.local.json"))).toBe(true);
  expect(existsSync(join(dir, ".claude/settings.json"))).toBe(false);
  // .claude 本身不進 gitignore（使用者自管）
  expect(readFileSync(join(dir, ".gitignore"), "utf8")).not.toContain(".claude");
});

test("project scope：建 <slug>.vault（可見）、不進 gitignore", () => {
  const parent = mkdtempSync(join(tmpdir(), "elgt-proj-"));
  const dir = join(parent, "my-app");
  mkdirSync(dir);
  boot(dir, { claudeScope: "project", codexScope: "none" });
  expect(existsSync(join(dir, "my-app.vault/palace/wake/identity.md"))).toBe(true);
  const gi = readFileSync(join(dir, ".gitignore"), "utf8");
  expect(gi).not.toContain("my-app.vault/");
});

test("混用 local+project → throw", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-mix-"));
  expect(() => boot(dir, { claudeScope: "local", codexScope: "project" })).toThrow(/local.*project|混用/);
});
```

  並更新既有 `"user scope"` 與 `"agent scope none"` 測試:預設已改 user,呼叫端仍顯式帶 scope 不受影響;無顯式 scope 的第一個測試(`"空 temp dir"`)現在預設 user → 不再產生 `<dir>/.claude/settings.json`(改到 user dir)。將該測試的 `RENDERED_RELPATHS` 迴圈與斷言調整為顯式帶 `{ claudeScope: "project", codexScope: "project" }` 以維持「產在 vault 內」的原意。

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test src/core/application/bootstrap.test.ts -t "local scope"`
Expected: FAIL

- [ ] **Step 3: 改 bootstrap.ts**:
  1. `BootstrapOptions` 預設(第 137-141 行附近):`claudeScope ?? "user"`、`codexScope ?? "user"`。
  2. 入口加混用驗證:

```ts
import { deriveVaultMode, resolveVaultDir, vaultDirName } from "@core/application/vault-naming";

function assertScopeCompatible(claude: AgentConfigScope, codex: AgentConfigScope): void {
  const hasLocal = claude === "local" || codex === "local";
  const hasProjOrUser = [claude, codex].some((s) => s === "project" || s === "user");
  if (hasLocal && hasProjOrUser) {
    throw new Error("scope 混用不合法：local 只能與 local 或 none 併用（不可與 project/user 混用）");
  }
}
```

  3. vault 路徑:`const mode = deriveVaultMode(resolvedOptions.claudeScope, resolvedOptions.codexScope);` `const vaultDir = resolveVaultDir(mode, targetDir, options.vaultName);` 取代 `join(targetDir, vaultName)`(scaffoldVault/regenerateIndexes/MCP env 都改用 `vaultDir`)。`vaultName`(給 hook 的 `ELEGENT_VAULT_NAME`)改為 `vaultDirName(mode, targetDir, options.vaultName)`。
  4. local scope:Claude hooks 目標檔改 `settings.local.json`(在 `renderedFiles` 針對 `claudeScope === "local"` 分支設 `rel: ".claude/settings.local.json"`、`base: targetDir`)。
  5. local gitignore:mode==="local" 時,把 `${vaultDirName}/` append 進 `<targetDir>/.gitignore`(冪等:讀既有→若不含該行才加)。用 `FileStore.tryRead`+`write`:

```ts
function ensureGitignoreLine(store: FileStore, targetDir: string, line: string, created: string[]): void {
  const p = join(targetDir, ".gitignore");
  const existing = store.tryRead(p);
  const lines = existing ? existing.split("\n") : [];
  if (lines.includes(line)) return;
  const next = (existing && !existing.endsWith("\n") ? existing + "\n" : existing ?? "") + line + "\n";
  if (existing === null) created.push(p);
  store.write(p, next);
}
```

  註:vault 的 `.gitignore` 模板仍寫在 vault 內(`.elegent-state/` 等);local 的是把 vault 目錄加進 **targetDir**(專案根)的 `.gitignore`,兩者不同檔。

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test src/core/application/bootstrap.test.ts src/architecture.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/application/bootstrap.ts src/core/application/bootstrap.test.ts
git commit -m "feat(init): local/project 嵌入式 vault、local gitignore、預設 scope user、混用驗證"
```

---

## Task 10: bootstrap 條件 MCP 註冊

**Files:**
- Modify: `src/core/application/bootstrap.ts`（注入 `McpRegistrar`）、`src/core/application/templates.ts`（Codex MCP 寫檔已由 Task 6 提供 `renderCodexMcpToml`）
- Test: `src/core/application/bootstrap.test.ts`（fake registrar）

**Interfaces:**
- Consumes: Task 5 `McpRegistrar`/`McpRegisterOpts`;Task 6 `renderCodexMcpToml`;Task 4 `deriveVaultMode`;Task 7 的 `boot()` test helper。
- Produces: `bootstrap` 簽名加第 3 個 port 參數 `registrar: McpRegistrar`(置於 `git` 之後,即 `bootstrap(store, git, registrar, targetDir, elegentBin, options)`);依 scope 條件註冊(user→直接註冊;local/project→僅當對應 `*UserServerExists()` 為 false 時註冊)。
- **簽名遷移**:本任務是唯一改 `bootstrap` 簽名之處。改後需(a)更新 `boot()` helper 傳入預設 fake registrar;(b)更新 `elgt.ts` 的真實呼叫。Task 7-9 的測試都經 `boot()`,故不必逐一改。

- [ ] **Step 1: 寫失敗測試**（fake registrar 記錄呼叫；先更新 `boot()` helper）:

先把 Task 7 的 `boot()` helper 改為傳入預設 fake registrar（一處修改，涵蓋 Task 7-9 全部呼叫）:

```ts
const noopRegistrar: McpRegistrar = {
  claudeUserServerExists: () => false,
  codexUserServerExists: () => false,
  registerClaude: () => ({ ok: true, detail: "" }),
  registerCodex: () => ({ ok: true, detail: "" }),
};
function boot(dir: string, opts: Parameters<typeof bootstrap>[5] = {}) {
  return bootstrap(nodeFileStore, nodeGitRunner, noopRegistrar, dir, ELEGENT_BIN, opts);
}
```

接著加以下用「可檢視 calls 的 fake」的新測試(直接呼叫 `bootstrap` 以注入特定 registrar):

```ts
import type { McpRegistrar, McpRegisterOpts } from "@core/ports";

function fakeRegistrar(userExists = false) {
  const calls: Array<{ agent: string; opts: McpRegisterOpts }> = [];
  const reg: McpRegistrar = {
    claudeUserServerExists: () => userExists,
    codexUserServerExists: () => userExists,
    registerClaude: (opts) => { calls.push({ agent: "claude", opts }); return { ok: true, detail: "" }; },
    registerCodex: (opts) => { calls.push({ agent: "codex", opts }); return { ok: true, detail: "" }; },
  };
  return { reg, calls };
}

test("user scope：呼叫 registerClaude --scope user", () => {
  const dir = mkdtempSync(join(tmpdir(), "elgt-reg-user-"));
  const { reg, calls } = fakeRegistrar();
  bootstrap(nodeFileStore, nodeGitRunner, reg, dir, ELEGENT_BIN, {
    claudeScope: "user", codexScope: "none", claudeUserDir: join(dir, ".claude"),
  });
  const c = calls.find((x) => x.agent === "claude");
  expect(c?.opts.scope).toBe("user");
});

test("local scope + 已有 user server：跳過 local 註冊", () => {
  const parent = mkdtempSync(join(tmpdir(), "elgt-reg-local-skip-"));
  const dir = join(parent, "app"); mkdirSync(dir);
  const { reg, calls } = fakeRegistrar(true); // user server 已存在
  bootstrap(nodeFileStore, nodeGitRunner, reg, dir, ELEGENT_BIN, {
    claudeScope: "local", codexScope: "none",
  });
  expect(calls.find((x) => x.agent === "claude")).toBeUndefined();
});

test("local scope + 無 user server：註冊 --scope local，ELEGENT_VAULT 指向嵌入 vault", () => {
  const parent = mkdtempSync(join(tmpdir(), "elgt-reg-local-"));
  const dir = join(parent, "app"); mkdirSync(dir);
  const { reg, calls } = fakeRegistrar(false);
  bootstrap(nodeFileStore, nodeGitRunner, reg, dir, ELEGENT_BIN, {
    claudeScope: "local", codexScope: "none",
  });
  const c = calls.find((x) => x.agent === "claude");
  expect(c?.opts.scope).toBe("local");
  expect(c?.opts.vaultRoot).toBe(join(dir, ".app.vault"));
});
```

  並更新所有既有 `bootstrap(...)` 呼叫,插入 fake registrar 為第 3 參數(可做一個 test helper `boot(dir, opts)` 包起來以 DRY)。

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test src/core/application/bootstrap.test.ts`
Expected: FAIL（bootstrap 尚無 registrar 參數/註冊邏輯 → 型別/執行錯誤）

- [ ] **Step 3: 改 bootstrap.ts**:
  1. 簽名:`export function bootstrap(store, git, registrar: McpRegistrar, targetDir, elegentBin, options = {})`。
  2. 在寫完設定檔後,依 scope 註冊 MCP:

```ts
function registerMcp(registrar: McpRegistrar, opts: Required<BootstrapOptions>, vaultDir: string, targetDir: string, elegentBin: string, warnings: string[]): void {
  const claude = opts.claudeScope, codex = opts.codexScope;
  const wantScope = (s: AgentConfigScope): "project" | "user" | "local" | null =>
    s === "none" ? null : s;

  if (claude !== "none") {
    const scope = wantScope(claude)!;
    const skip = (scope === "local" || scope === "project") && registrar.claudeUserServerExists();
    if (!skip) {
      const r = registrar.registerClaude({ scope, vaultRoot: vaultDir, elegentBin, cwd: targetDir });
      if (!r.ok) warnings.push(`Claude MCP 註冊失敗（可手動 claude mcp add）：${r.detail}`);
    }
  }
  if (codex !== "none") {
    const scope = wantScope(codex)!;
    if (scope === "user") {
      const r = registrar.registerCodex({ scope, vaultRoot: vaultDir, elegentBin, cwd: targetDir });
      if (!r.ok) warnings.push(`Codex MCP 註冊失敗（可手動 codex mcp add）：${r.detail}`);
    } else {
      // project/local：Codex 無 scope flag，改寫 .codex/config.toml；有 user server 則跳過
      if (!registrar.codexUserServerExists()) {
        const p = join(targetDir, ".codex/config.toml");
        const existing = store.tryRead(p); // 註：store 需傳入或此函式併入 bootstrap 內閉包
        if (existing === null || !existing.includes("[mcp_servers.elegent-memory]")) {
          const block = renderCodexMcpToml(elegentBin, vaultDir);
          store.write(p, existing ? existing.replace(/\n*$/, "\n\n") + block : block);
          created.push(p);
        }
      }
    }
  }
}
```

  註:上述為邏輯示意;實作時把它寫成 `bootstrap` 內的區塊或傳入 `store`/`created`。Codex project/local 走 `.codex/config.toml` 合併(冪等:已含 `[mcp_servers.elegent-memory]` 則跳過)。
  3. `import { renderCodexMcpToml } from "@core/application/templates";`、`import type { McpRegistrar } from "@core/ports";`。

- [ ] **Step 4: 改呼叫端 `elgt.ts`** — `defaultDeps().init` 內 `bootstrap(nodeFileStore, nodeGitRunner, dir, elegentBin, …)` → 加 `agentCliRegistrar`:`bootstrap(nodeFileStore, nodeGitRunner, agentCliRegistrar, dir, elegentBin, …)`;`import { agentCliRegistrar } from "@infrastructure/adapters/agent-cli";`。

- [ ] **Step 5: 跑測試確認通過**

Run: `bun test src/core/application/bootstrap.test.ts src/presentation/cli/elgt.test.ts src/architecture.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/application/bootstrap.ts src/presentation/cli/elgt.ts src/core/application/bootstrap.test.ts
git commit -m "feat(init): 條件式 MCP 註冊（user 直註；local/project 有 user 則跳過）"
```

---

## Task 11: MCP server 多 vault root + 自動探測(丙)

**Files:**
- Modify: `src/presentation/mcp/server.ts`
- Test: `src/presentation/mcp/server.test.ts`

**Interfaces:**
- Consumes: `slugify`（`@core/domain/safety`）。
- Produces:
  - `resolveVaultRoots(env: { ELEGENT_VAULT?: string; CLAUDE_PROJECT_DIR?: string }, cwd: string): string[]`
  - `searchVaults(roots: string[], query: string, limit: number): string[]`（結果以 `[標籤] file:line: snippet`,標籤=root basename）
  - 現有 `searchVault`/`listDir`/`readNote` 保留;tools 改用多 root 版本。

- [ ] **Step 1: 寫失敗測試**:

```ts
import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { slugify } from "@core/domain/safety";
import { resolveVaultRoots, searchVaults } from "@presentation/mcp/server";

test("resolveVaultRoots：主 vault + 自動探測 .{slug}.vault / {slug}.vault，realpath 去重", () => {
  const proj = mkdtempSync(join(tmpdir(), "app-")); // basename 隨機，取其 slug
  const base = slugify(basename(proj));
  const global = mkdtempSync(join(tmpdir(), "global-vault-"));
  mkdirSync(join(proj, `.${base}.vault`));
  const roots = resolveVaultRoots({ ELEGENT_VAULT: global, CLAUDE_PROJECT_DIR: proj }, proj);
  expect(roots).toContain(global);
  expect(roots.some((r) => r.endsWith(`.${base}.vault`))).toBe(true);
});

test("searchVaults：結果帶 [標籤] 前綴", () => {
  const v1 = mkdtempSync(join(tmpdir(), "v1-"));
  writeFileSync(join(v1, "a.md"), "hello world\n");
  const hits = searchVaults([v1], "hello", 20);
  expect(hits[0]).toMatch(/^\[.+\] a\.md:1: hello world$/);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test src/presentation/mcp/server.test.ts`
Expected: FAIL（函式未匯出）

- [ ] **Step 3: 實作** — 在 `server.ts` 加:

```ts
import { basename } from "node:path";
import { existsSync } from "node:fs";
import { slugify } from "@core/domain/safety";

/** 解析所有要服務的 vault root：主 ELEGENT_VAULT + CLAUDE_PROJECT_DIR/cwd 下的嵌入 vault，realpath 去重。 */
export function resolveVaultRoots(env: { ELEGENT_VAULT?: string; CLAUDE_PROJECT_DIR?: string }, cwd: string): string[] {
  const roots: string[] = [env.ELEGENT_VAULT ?? join(cwd, "vault")];
  const projectDir = env.CLAUDE_PROJECT_DIR ?? cwd;
  const base = slugify(basename(projectDir));
  if (base) {
    for (const name of [`.${base}.vault`, `${base}.vault`]) {
      const p = join(projectDir, name);
      if (existsSync(p)) roots.push(p);
    }
  }
  const seen = new Set<string>();
  return roots.filter((r) => {
    let rp: string;
    try { rp = realpathSync(r); } catch { rp = resolve(r); }
    if (seen.has(rp)) return false;
    seen.add(rp);
    return true;
  });
}

/** 跨多個 vault root 搜尋，結果以 root basename 標籤前綴。 */
export function searchVaults(roots: string[], query: string, limit: number): string[] {
  const out: string[] = [];
  for (const root of roots) {
    if (out.length >= limit) break;
    const tag = basename(root);
    for (const hit of searchVault(root, query, limit - out.length)) {
      out.push(`[${tag}] ${hit}`);
      if (out.length >= limit) break;
    }
  }
  return out;
}
```

  並把 `startServer()` 內:`const vaultRoot = …` 改為 `const roots = resolveVaultRoots(process.env, process.cwd());`;`memory_search` 改呼叫 `searchVaults(roots, query, limit ?? DEFAULT_SEARCH_LIMIT)`;`memory_list` 預設列第一個 root(或各 root 加標籤,擇一實作,測試對應);`memory_read` 依序在各 root 嘗試 `resolveInVault` 命中即回;`memory_wake` 用 `roots[0]`(主 vault)建 bundle。保留單 root 純函式供重用。

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test src/presentation/mcp/server.test.ts src/architecture.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/presentation/mcp/server.ts src/presentation/mcp/server.test.ts
git commit -m "feat(mcp): server 多 vault root + 自動探測嵌入 vault，搜尋結果標註來源"
```

---

## Task 12: CLI/UI 收尾 + docs + dogfood 修復

**Files:**
- Modify: `src/presentation/cli/elgt.ts`、`src/presentation/cli/init-ui.tsx`、`/.mcp.json`、`CLAUDE.md`(repo 根)、`docs/manual/index.html`
- Test: `src/presentation/cli/elgt.test.ts`

**Interfaces:**
- Consumes: 既有 `deps()`/`main`（`elgt.test.ts`）。
- Produces: `parseInitArgs` 接受 `local` 為合法 scope,並在 CLI 旗標層擋掉 `local`+`project`/`user` 混用(回 `null` → USAGE → exit 2);預設 scope = `user`;USAGE/init 訊息更新。

- [ ] **Step 1: 寫失敗測試** — 在 `elgt.test.ts` 加(用既有 `deps()` helper + `main`;不改 `parseInitArgs` 可見度):

```ts
test("init flags：--claude-scope local 合法並傳遞給 deps.init", async () => {
  let received: unknown;
  const code = await main(
    ["init", "/some/dir", "--claude-scope", "local", "--codex-scope", "none"],
    deps({ init: async (_dir, options) => { received = options; return 0; } }),
  );
  expect(code).toBe(0);
  expect(received).toMatchObject({ claudeScope: "local", codexScope: "none" });
});

test("init flags：local 混 user → exit 2（CLI 層擋下，不進 deps.init）", async () => {
  let called = false;
  const code = await main(
    ["init", "/some/dir", "--claude-scope", "local", "--codex-scope", "user"],
    deps({ init: async () => { called = true; return 0; } }),
  );
  expect(code).toBe(2);
  expect(called).toBe(false);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test src/presentation/cli/elgt.test.ts`
Expected: FAIL（`local` 目前非合法 scope → 第一個測試 exit 2;第二個測試 local 現在根本沒被接受,行為不符）

- [ ] **Step 3: 改 `elgt.ts`**:
  1. `isAgentConfigScope`(第 67-69 行)改為含 `local`:`value === "project" || value === "user" || value === "local" || value === "none"`。
  2. `parseInitArgs` 在回傳前加混用驗證(CLI 旗標層,回 `null` 讓 `main` 印 USAGE + exit 2):

```ts
  const hasLocal = claudeScope === "local" || codexScope === "local";
  const hasProjOrUser = [claudeScope, codexScope].some((s) => s === "project" || s === "user");
  if (hasLocal && hasProjOrUser) return null;
```

  3. prompt defaults(第 209-210 行):`options.claudeScope ?? "user"`、`options.codexScope ?? "user"`。
  4. `deps.init`(defaultDeps)包住 bootstrap 的 throw:try/catch → `console.error(訊息)` + `return 1`(擋 wizard/程式化路徑漏出的混用,與 CLI 層雙保險)。
  5. `USAGE`(第 22 行):`--claude-scope project|user|local|none`(codex 同),補註預設 `user`。
  6. init 完成訊息(第 149-159 行):移除 AGENTS.md/手動 codex mcp 段;加 local 專屬提示(印 vault 名與「已加入 .gitignore」)。

- [ ] **Step 4: 改 `init-ui.tsx`** — `SCOPE_OPTIONS`(第 14-18 行)加 `{ label: "Local scope（嵌入本專案、私有）", value: "local" }`;`InitWizard` 的 `defaults` 由呼叫端給(已是 user)。

- [ ] **Step 5: 修 dogfood `/.mcp.json`** — 內容改為指向現路徑:

```json
{
  "mcpServers": {
    "elegent-memory": {
      "command": "bun",
      "args": ["src/presentation/mcp/server.ts"],
      "env": { "ELEGENT_VAULT": "vault" }
    }
  }
}
```

- [ ] **Step 6: 更新 repo 根 `CLAUDE.md`** — `src/assets/` 清單那段:移除 `claude-md.md`、`mcp-json.tmpl`;加 `codex-mcp.tmpl`。並更新「vault 使用者會看到的行為」敘述(不再產 CLAUDE.md)。

- [ ] **Step 7: 更新 `docs/manual/index.html`** — 說明 init 不再產 CLAUDE.md、MCP 自動註冊、三種 scope（user/project/local）用途與 local 的 `.{slug}.vault` 命名。

- [ ] **Step 8: 跑全測試**

Run: `bun test`
Expected: PASS（全綠）

- [ ] **Step 9: Commit**

```bash
# 精確 add 本任務改到的檔（禁用 git add -A：工作區有無關 WIP docs/architecture、.agents、.gemini）
git add src/presentation/cli/elgt.ts src/presentation/cli/init-ui.tsx \
  src/presentation/cli/elgt.test.ts .mcp.json CLAUDE.md docs/manual/index.html
git commit -m "feat(cli): local scope、預設 user、USAGE/init 訊息；docs 與 dogfood .mcp.json 修復"
```

---

## Task 13: 端到端手動驗證 + build/smoke

**Files:** 無(驗證性任務)

- [ ] **Step 1: build + smoke + 全測試**

Run: `bun test && bun run build && bun run smoke`
Expected: 全綠;`dist/elgt` 產出。

- [ ] **Step 2: user scope（預設）E2E** — 於暫存資料夾:

```bash
tmp=$(mktemp -d); dist/elgt init "$tmp/mem" --vault-name memory --claude-scope user --codex-scope none --yes
```
Expected: `$tmp/mem/memory/` 有 PARA+palace;無 `CLAUDE.md`/`AGENTS.md`/`.mcp.json`;若機器有 `claude` CLI,`claude mcp get elegent-memory` 顯示 user scope(否則 warnings 提示手動)。

- [ ] **Step 3: local scope E2E**:

```bash
proj=$(mktemp -d)/my-app; mkdir -p "$proj"; (cd "$proj" && git init -q)
dist/elgt init "$proj" --claude-scope local --codex-scope none --yes
```
Expected: `$proj/.my-app.vault/` 存在;`$proj/.gitignore` 含 `.my-app.vault/`;`$proj/.claude/settings.local.json` 含 hook;`git -C "$proj" status` 不顯示 `.my-app.vault`(已忽略)。

- [ ] **Step 4: 混用驗證**:

```bash
dist/elgt init "$(mktemp -d)" --claude-scope local --codex-scope user --yes; echo "exit=$?"
```
Expected: 非零 exit + 清楚錯誤訊息。

- [ ] **Step 5: 冪等** — 對 Step 2 的資料夾重跑同指令,`created` 為空、`.gitignore` 不重複、`claude mcp` 不報重複錯。

- [ ] **Step 6: 分層查詢 sanity（若有 claude CLI）** — 在 `$proj` 內開 Claude,確認 `memory_search` 結果同時出現全域與 `.my-app.vault` 的 `[標籤]`(或以 `resolveVaultRoots` 單測已覆蓋為準)。

- [ ] **Step 7: 最終 commit（若有殘留調整）**

```bash
# 僅在 repo 內（非暫存目錄）有本重構的殘留調整時精確 add；禁用 git add -A（工作區有無關 WIP）。
# 若無殘留變更就跳過。E2E 產物都在 mktemp 暫存目錄，不會進 repo。
git status --short   # 先檢視；只 add 屬於本重構的檔後再 commit
```
