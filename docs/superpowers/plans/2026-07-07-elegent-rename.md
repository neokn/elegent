# EleGent 改名實作計畫（palace → EleGent / elgt）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依 [改名設計文件](../specs/2026-07-07-elegent-rename-design.md) 把產品識別從 palace 全面改為 EleGent（CLI＝`elgt`），記憶宮殿（`vault/palace/`）概念完整保留。

**Architecture:** 純改名重構、零行為變更——既有測試套件就是驗證網（改斷言字串、不改測試邏輯）。任務按檔案集合切分，每個任務對其觸及的檔案「一次改完」（env、CLI 指涉、註解、文案），每個 commit 都通過 `bun test`。

**Tech Stack:** Bun + TypeScript、bun:test、git mv

## Global Constraints

以下 token 級替換規則全計畫通用（大小寫敏感、完整 token 比對，**禁止全域盲目 sed**——`palace` 裸詞需逐處判讀）：

| 舊 | 新 | 說明 |
|---|---|---|
| `PALACE_VAULT` | `ELEGENT_VAULT` | env |
| `PALACE_AUTO_DIGEST` | `ELEGENT_AUTO_DIGEST` | env |
| `PALACE_HEADLESS_DIGEST` | `ELEGENT_HEADLESS_DIGEST` | env |
| `PALACE_COMPILED` | `ELEGENT_COMPILED` | 編譯期 define |
| `PALACE_BIN` | `ELEGENT_BIN` | 模板參數／佔位符／smoke 常數 |
| `.palace-state` | `.elegent-state` | 狀態目錄 |
| `palace-memory` | `elegent-memory` | MCP server 名 |
| `tools/cli/palace.ts` | `tools/cli/elgt.ts` | CLI 源檔（git mv） |
| `dist/palace` | `dist/elgt` | 編譯產物 |
| `palace-darwin-arm64` | `elgt-darwin-arm64` | release asset |
| `resolvePalaceBin` | `resolveElegentBin` | 函式名 |
| `palaceBin` | `elegentBin` | 變數／參數名 |
| `palace-smoke` | `elgt-smoke` | smoke 的 clientInfo 與 tmpdir prefix |
| `neokn/llm-wiki` | `neokn/EleGent` | repo 引用 |
| 註解／usage／文件中 CLI 用例 `palace <sub>`（如 `palace lint`、`palace hook stop`、`palace init`） | `elgt <sub>` | 產品指涉 |
| 使用者可見品牌詞 palace（標題、hero、commit 訊息「palace 記憶系統」） | EleGent | 品牌 |

**禁改白名單**（出現 `palace` 但必須保留）：`vault/` 全部；程式與模板中的 vault 內路徑字串（`palace/raw…`、`palace/wake…`、`palace/entities`、`palace/map.md`、`palace/log.md`、`palace/index.md`）；tags（`palace/raw`、`palace/entity` 等）；中文「記憶宮殿」與 scaffold 的「Palace Map」標題；`docs/manual/phase-1|2|3.html`；`docs/research/`、`docs/superpowers/`；`ref/`。

版本號維持 `0.3.0`。commit 訊息尾註（每個 commit 都要）：

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TYW3b3bf42rP9iCcc7t5ur
```

---

### Task 1: 執行期識別字——env vars、狀態目錄、MCP server 名

**Files:**
- Modify: `tools/lib/version.ts`、`tools/lib/state.ts`、`tools/lib/autodigest.ts`、`tools/hooks/stop.ts`、`tools/hooks/precompact.ts`、`tools/hooks/sessionend.ts`、`tools/hooks/sessionstart.ts`、`tools/mcp/server.ts`、`.gitignore`、`.mcp.json`、`.claude/settings.local.json`
- Test: `tools/lib/version.test.ts`、`tools/lib/state.test.ts`、`tools/lib/autodigest.test.ts`、`tools/hooks/stop.test.ts`、`tools/hooks/precompact.test.ts`、`tools/hooks/sessionend.test.ts`、`tools/hooks/sessionstart.test.ts`、`tools/mcp/server.test.ts`

**Interfaces:**
- Produces: `SERVER_INFO.name === "elegent-memory"`；狀態目錄常數 `.elegent-state`；env 讀取點全部 `ELEGENT_*`。後續任務（模板、smoke、文件）以這些新名為準。
- 注意：`scripts/build.ts` 的 `--define "process.env.PALACE_COMPILED='1'"` 在 Task 2 才改——本 task 完成後、Task 2 完成前**不要跑 `bun run build`**（`bun test` 不受影響，compiled 判定在 dev 模式走 execPath fallback、測試用注入）。

- [ ] **Step 1: 套用替換**

對上列 11 個源檔＋8 個測試檔套用 Global Constraints 表中的這幾條：`PALACE_VAULT`、`PALACE_AUTO_DIGEST`、`PALACE_HEADLESS_DIGEST`、`PALACE_COMPILED`、`.palace-state`、`palace-memory`，並把**這些檔案內**註解中的產品指涉一次改完。關鍵行的新內容：

`tools/mcp/server.ts:14`：
```ts
export const SERVER_INFO = { name: "elegent-memory", version: VERSION };
```
`tools/mcp/server.ts:100`：
```ts
  const vaultRoot = process.env.ELEGENT_VAULT ?? join(process.cwd(), "vault");
```
`tools/lib/version.ts:24`：
```ts
  if (process.env.ELEGENT_COMPILED === "1") return true;
```
`tools/lib/state.ts:8`：
```ts
  const d = join(repoRoot, ".elegent-state");
```
`tools/lib/autodigest.ts:37`：
```ts
  const d = join(repoRoot, ".elegent-state");
```
`tools/lib/autodigest.ts:140`：
```ts
      env: { ...process.env, ELEGENT_AUTO_DIGEST: "0", ELEGENT_HEADLESS_DIGEST: "1" },
```
hooks 三處 env 判斷（`stop.ts:41`、`precompact.ts:30`、`sessionend.ts:57`）：
```ts
    if (process.env.ELEGENT_HEADLESS_DIGEST === "1") {
```
`sessionend.ts:76`：
```ts
          enabled: process.env.ELEGENT_AUTO_DIGEST === "1",
```
`.gitignore`（整檔）：
```
.DS_Store
node_modules/
.elegent-state/
dist/
```
`.mcp.json`（整檔）：
```json
{
  "mcpServers": {
    "elegent-memory": {
      "command": "bun",
      "args": ["tools/mcp/server.ts"]
    }
  }
}
```
`.claude/settings.local.json`（整檔）：
```json
{
  "enabledMcpjsonServers": [
    "elegent-memory"
  ]
}
```
註解類（同批檔案內，例）：`version.ts` 開頭 `/** palace 的單一版本真理來源` → `/** EleGent 的單一版本真理來源`、`bun tools/cli/palace.ts` → `bun tools/cli/elgt.ts`、`palace.ts 的 resolvePalaceBin` → `elgt.ts 的 resolveElegentBin`；`autodigest.ts` 的「編譯後的 palace binary」→「編譯後的 elgt binary」、`{{PALACE_BIN}} guard` → `{{ELEGENT_BIN}} guard`、`.palace-state/digest.lock` → `.elegent-state/digest.lock`、`.palace-state/autodigest.log` → `.elegent-state/autodigest.log`；hooks 註解 `palace hook stop` → `elgt hook stop` 等。**這些檔案內的 `palace/raw`、`palace/wake` 等 vault 路徑字串一律不動**（`wake.ts`、`archive.ts`、`lint.ts` 不在本 task 檔案清單內，整檔不碰）。

- [ ] **Step 2: 驗證測試全綠**

Run: `bun test`
Expected: 全部 pass、0 fail。

- [ ] **Step 3: 驗證無殘留**

Run: `grep -rn 'PALACE_VAULT\|PALACE_AUTO_DIGEST\|PALACE_HEADLESS_DIGEST\|PALACE_COMPILED\|\.palace-state\|palace-memory' tools/lib tools/hooks tools/mcp .gitignore .mcp.json .claude/settings.local.json`
Expected: 無輸出（`tools/cli`、`tools/assets`、`scripts` 的殘留屬 Task 2）。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: EleGent 改名（一）——env 變數、狀態目錄、MCP server 名"
```

---

### Task 2: CLI 改名 elgt ＋ 模板資產 ＋ 建置

**Files:**
- Rename: `tools/cli/palace.ts` → `tools/cli/elgt.ts`；`tools/cli/palace.test.ts` → `tools/cli/elgt.test.ts`
- Modify: `tools/cli/elgt.ts`、`tools/cli/guard.ts`、`tools/cli/reindex.ts`、`tools/cli/lint.ts`、`tools/cli/backfill.ts`、`tools/cli/scaffold.ts`（僅 :40 註解）、`tools/lib/bootstrap.ts`、`tools/lib/templates.ts`、`tools/assets/settings-json.tmpl`、`tools/assets/mcp-json.tmpl`、`tools/assets/gitignore.tmpl`、`tools/assets/claude-md.md`、`tools/assets/skill-digest.md`、`scripts/build.ts`、`scripts/smoke.ts`、`package.json`
- Test: `tools/cli/elgt.test.ts`、`tools/cli/guard.test.ts`、`tools/lib/bootstrap.test.ts`、`tools/lib/templates.test.ts`、`tools/cli/scaffold.test.ts`（若含產品指涉）

**Interfaces:**
- Consumes: Task 1 的 `ELEGENT_*`、`elegent-memory`、`.elegent-state`。
- Produces: CLI 入口 `tools/cli/elgt.ts`（`bun run elgt`）；`TemplateVars.ELEGENT_BIN` 與 `{{ELEGENT_BIN}}` 佔位符；`bootstrap(targetDir, elegentBin)`；`dist/elgt` 編譯產物。

- [ ] **Step 1: git mv 兩個檔案**

```bash
git mv tools/cli/palace.ts tools/cli/elgt.ts
git mv tools/cli/palace.test.ts tools/cli/elgt.test.ts
```

- [ ] **Step 2: 改 `tools/cli/elgt.ts`**

USAGE 全文改為：
```ts
const USAGE = `用法: elgt <command> [args]

指令:
  hook <stop|precompact|sessionend|sessionstart>  執行對應 hook（讀 stdin JSON）
  init [dir]                                      在（通常是空的）資料夾建立完整記憶系統
  reindex [vault]                                 重生 index.md
  lint [vault]                                    檢查 vault（違規時 exit 1）
  guard <file>                                    檢查檔案是否違反 palace/raw append-only 規則
  backfill [projectsDir]                          回填既有逐字稿（未歸檔的 session）
  mcp                                              啟動 elegent-memory MCP server（stdio）
  version                                          印出版本
`;
```
（`guard` 說明行的 `palace/raw` 是 vault 路徑，保留。）
`resolvePalaceBin` → `resolveElegentBin`（宣告與呼叫處）；函式內 `return \`bun ${resolve(import.meta.dir, "palace.ts")}\`` → `"elgt.ts"`；init「下一步」訊息的 `.mcp.json 裡的 palace-memory MCP server` → `elegent-memory`；註解中 `palace CLI 的統一路由層` → `elgt CLI 的統一路由層`、`PALACE_COMPILED` → `ELEGENT_COMPILED`。

- [ ] **Step 3: 改 `tools/cli/elgt.test.ts` 與其他 cli 檔**

`elgt.test.ts`：import `./palace` → `./elgt`；斷言 USAGE 含 `用法: elgt` 等字串跟隨 Step 2。
`guard.ts:11` 改為：
```ts
  if (!file) { console.error("用法: elgt guard <file>（或 bun tools/cli/guard.ts <file>）"); return 2; }
```
`guard.test.ts` 對應 usage 斷言同步。`reindex.ts:4`、`lint.ts:4`、`backfill.ts:42`、`scaffold.ts:40` 註解中 `palace reindex|lint|backfill|路由` → `elgt …`。`backfill.ts:31` 的 `palace/raw/conversations` 保留。

- [ ] **Step 4: 改模板層 `templates.ts`＋4 個 assets＋`bootstrap.ts`**

`templates.ts`：`TemplateVars` 的 `PALACE_BIN: string` → `ELEGENT_BIN: string`；`replaceAll("{{PALACE_BIN}}", vars.PALACE_BIN)` → `replaceAll("{{ELEGENT_BIN}}", vars.ELEGENT_BIN)`；註解同步（`bun tools/cli/elgt.ts`）。
`settings-json.tmpl`：4 個 hook command 與 permissions 的 `{{PALACE_BIN}}` → `{{ELEGENT_BIN}}`（共 5 處）。
`mcp-json.tmpl`（整檔）：
```json
{
  "mcpServers": {
    "elegent-memory": {
      "command": "{{ELEGENT_BIN}}",
      "args": ["mcp"]
    }
  }
}
```
`gitignore.tmpl`（整檔）：
```
.DS_Store
.elegent-state/
```
`claude-md.md`：標題 `# 個人記憶系統（palace）` → `# 個人記憶系統（EleGent）`；`{{PALACE_BIN}}` → `{{ELEGENT_BIN}}`（4 處）；`vault/palace/`、`palace/map.md`、`palace/raw/` 等全部保留。
`skill-digest.md`：`.palace-state/digest-cursor` → `.elegent-state/digest-cursor`（2 處）；`{{PALACE_BIN}}` → `{{ELEGENT_BIN}}`（4 處）；`palace/raw`、`vault/palace/…` 全部保留。
`bootstrap.ts`：參數 `palaceBin` → `elegentBin`（含 JSDoc）；`renderTemplate(template, { ELEGENT_BIN: elegentBin })`；git commit 訊息 → `"init: EleGent 記憶系統初始化"`；註解 `bun /abs/palace.ts` → `bun /abs/elgt.ts`、`呼叫端（palace init）` → `（elgt init）`；`resources/archives/palace` 目錄列舉註解保留。

- [ ] **Step 5: 改 `build.ts`、`smoke.ts`、`package.json`**

`build.ts`：`ENTRY = join(REPO_ROOT, "tools/cli/elgt.ts")`；`OUTFILE = join(REPO_ROOT, "dist/elgt")`；define → `"process.env.ELEGENT_COMPILED='1'"`；註解 `palace init` → `elgt init`。
`smoke.ts`：常數 `PALACE_BIN` → `ELEGENT_BIN = join(REPO_ROOT, "dist/elgt")`（引用處全改）；`mcpServers?.["elegent-memory"]`；`command.endsWith("/elgt")`；`ELEGENT_VAULT`；`clientInfo: { name: "elgt-smoke", … }`；`serverInfo?.name !== "elegent-memory"`；`mkdtempSync(join(tmpdir(), "elgt-smoke-"))`；註解中 `dist/palace` → `dist/elgt`、`palace` 產品詞 → `elgt`。
`package.json`：`"name": "elegent"`；scripts `"palace": "bun tools/cli/palace.ts"` → `"elgt": "bun tools/cli/elgt.ts"`。

- [ ] **Step 6: 測試檔斷言同步**

`bootstrap.test.ts`（38 處）：`palace-memory` → `elegent-memory`、`PALACE_BIN` → `ELEGENT_BIN`、`palaceBin` → `elegentBin`、`init: palace 記憶系統初始化` → `init: EleGent 記憶系統初始化`、`.palace-state` → `.elegent-state`；`vault/palace/...` 路徑斷言保留。
`templates.test.ts`（18 處）：`{{PALACE_BIN}}`／`PALACE_BIN` → ELEGENT 版；模板內容斷言跟隨 Step 4。
`scaffold.test.ts`：僅產品指涉（若有）；`palace/wake` 等結構斷言保留。

- [ ] **Step 7: 驗證**

Run: `bun test`
Expected: 全綠。
Run: `bun run build && bun run smoke`
Expected: build 產出 `dist/elgt`；smoke 五步全 PASS（init 產物 command 以 `/elgt` 結尾、serverInfo.name=`elegent-memory`）。
Run: `bun run elgt version`
Expected: `0.3.0`

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "refactor: EleGent 改名（二）——CLI 入口 elgt、模板資產、建置產物"
```

---

### Task 3: 發佈管線——install.sh 與 release workflow

**Files:**
- Modify: `install.sh`、`.github/workflows/release.yml`

**Interfaces:**
- Consumes: Task 2 的 `dist/elgt`。
- Produces: asset 名 `elgt-darwin-arm64`；安裝目標 `~/.local/bin/elgt`；repo 引用 `neokn/EleGent`。

- [ ] **Step 1: 改 `install.sh`**

常數區改為：
```bash
REPO="neokn/EleGent"

INSTALL_DIR="${HOME}/.local/bin"
BIN_NAME="elgt"
ASSET_NAME="elgt-darwin-arm64"
```
頭部註解與所有使用者可見訊息中的 `palace` → `elgt`（產品）；`用法：curl … raw.githubusercontent.com/<REPO>/main/install.sh` 註解不含 hardcode 舊名則不動；尾段「可直接執行 \`palace version\` 驗證」→ `elgt version`。

- [ ] **Step 2: 改 `release.yml`**

`cp dist/palace dist/palace-darwin-arm64` → `cp dist/elgt dist/elgt-darwin-arm64`；上傳清單 `dist/palace-darwin-arm64` → `dist/elgt-darwin-arm64`；註解中 `dist/palace`、`("palace")`、下載 URL 範例同步為 elgt 版。版本一致性檢查若含 `palace version`／`palace-memory` 字樣 → `elgt version`／`elegent-memory`。

- [ ] **Step 3: 驗證**

Run: `bash -n install.sh && grep -c 'elgt' install.sh && grep -rn 'palace' install.sh .github/`
Expected: 語法 OK；grep palace 無輸出。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: EleGent 改名（三）——install.sh 與 release 管線"
```

---

### Task 4: 文件與品牌——repo CLAUDE.md 與整合手冊

**Files:**
- Modify: `CLAUDE.md`、`docs/manual/index.html`

**Interfaces:**
- Consumes: 前三個 task 的全部新名。
- Produces: 使用者可見品牌一律 EleGent／elgt；`vault/palace/` 敘述與「記憶宮殿」不動。

- [ ] **Step 1: 改 `CLAUDE.md`**

標題 `# llm-wiki：個人記憶系統` → `# EleGent：個人記憶系統`；工具段 `bun tools/cli/guard.ts` 保留（檔案路徑真實存在）、`bun run` script 名若引用 `palace` → `elgt`；`palace-memory` → `elegent-memory`（若出現）；`vault/palace/`、記憶宮殿、檢索 SOP 段保留。

- [ ] **Step 2: 改 `docs/manual/index.html`（品牌改版）**

替換組（全檔）：`palace init|lint|backfill|reindex|mcp|version|hook` → `elgt …`；`PALACE_VAULT` → `ELEGENT_VAULT`；`PALACE_AUTO_DIGEST` → `ELEGENT_AUTO_DIGEST`；`.palace-state` → `.elegent-state`；`palace-memory` → `elegent-memory`；`palace-darwin-arm64` → `elgt-darwin-arm64`；`dist/palace` → `dist/elgt`；`~/.local/bin/palace` → `~/.local/bin/elgt`；`neokn/llm-wiki` → `neokn/EleGent`；`which palace` → `which elgt`；`bun tools/cli/palace.ts`（如出現）→ `elgt.ts`。
品牌文案：`<title>` 與 hero `llm-wiki：你的個人記憶系統` → `EleGent：你的個人記憶系統`；hero 副標融入「Elephant + Agent——一頭記性最好的大象館員」；footer `llm-wiki 完整使用手冊` → `EleGent 完整使用手冊`；第 1 章「整套系統，一顆工具」段的執行檔名 `palace` → `elgt`（品牌敘述處寫「一顆名為 elgt 的執行檔（EleGent 的縮寫）」）。
**保留**：第 1 章 duo panel「書庫：palace 記憶宮殿」、`vault/palace/raw/conversations/`、`palace/map.md` 等 vault 路徑、「記憶宮殿」全部中文敘述。

- [ ] **Step 3: 驗證**

Run: `grep -n -i 'palace' CLAUDE.md docs/manual/index.html`
Expected: 殘留行僅限 vault 路徑（`vault/palace/`、`palace/map.md`、`palace/raw`…）與「palace 記憶宮殿」概念文字；無任何指令／env／server 名／URL 殘留。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "docs: EleGent 改名（四）——CLAUDE.md 與整合手冊品牌改版"
```

---

### Task 5: 終驗與收尾

**Files:**
- Modify: 無預期（僅修殘留）；本地 `mv .palace-state .elegent-state`（gitignored 機器狀態）

- [ ] **Step 1: 白名單掃描**

Run: `grep -rli 'palace' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=vault --exclude-dir=ref --exclude-dir=dist | sort`
Expected 僅：`docs/manual/phase-1.html`、`docs/manual/phase-2.html`、`docs/manual/phase-3.html`、`docs/research/*`、`docs/superpowers/*`、以及含 vault 路徑字串／宮殿敘述的源檔（`tools/cli/scaffold.ts`、`tools/cli/backfill.ts`、`tools/cli/elgt.ts`（guard 說明的 palace/raw）、`tools/cli/lint.ts`、`tools/lib/lint.ts`、`tools/lib/archive.ts`、`tools/lib/wake.ts`、`tools/lib/bootstrap.ts`（目錄列舉註解）、`tools/assets/claude-md.md`、`tools/assets/skill-digest.md`、`CLAUDE.md`、`docs/manual/index.html`、對應測試檔）。逐檔抽查殘留行皆屬白名單類型；發現漏網之魚→修正。

- [ ] **Step 2: 全套驗收**

Run: `bun test && bun run lint:vault && bun run build && bun run smoke && bun run elgt version`
Expected: test 全綠；lint 0 errors；build 產出 `dist/elgt`；smoke 全 PASS；version 印 `0.3.0`。

- [ ] **Step 3: 本地狀態目錄搬遷與舊產物清理**

```bash
[ -d .palace-state ] && mv .palace-state .elegent-state || true
rm -f dist/palace
```

- [ ] **Step 4: Commit（若 Step 1 有修正）＋收尾**

```bash
git add -A && git commit -m "refactor: EleGent 改名（五）——終驗殘留修正" # 僅在有改動時
git log --oneline -6
```
提醒使用者：GitHub repo 改名 `neokn/llm-wiki → neokn/EleGent` 由使用者操作（Settings → General → Repository name），舊 URL 自動轉址。
