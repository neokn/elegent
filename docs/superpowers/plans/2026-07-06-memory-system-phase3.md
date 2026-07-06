# 記憶系統 Phase 3 實作計畫：可發佈化

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 系統可發佈——任意空資料夾 `palace init` 一鍵建立完整記憶系統；執行免裝 Bun（`bun build --compile` 產出單一二進位）；GitHub Releases 發佈 + curl 安裝腳本。

**Architecture:** 新增統一 CLI 入口 `palace`（子指令路由到既有 lib 模組，零邏輯重寫）。模板資產（SKILL.md/CLAUDE.md/settings/mcp.json）抽出為可參數化模板，以 Bun text import 內嵌進二進位。`palace init` 在目標資料夾寫出 vault 骨架 + Claude Code 整合檔，hooks/MCP 指令指向二進位絕對路徑（`process.execPath`）。本 repo 自身維持 `bun tools/...` 開發模式不變。

**Tech Stack:** Bun + TypeScript、`bun build --compile --target=bun-darwin-arm64`、GitHub Actions（release workflow）、POSIX sh（install.sh）。

## Global Constraints

- 程式碼一律 Bun + TypeScript；測試 `bun:test` colocated
- 既有 122 測試不得回歸；hooks「絕不擋對話」鐵律不變
- 二進位名稱 `palace`；子指令：`init` / `hook <stop|precompact|sessionend|sessionstart>` / `reindex` / `lint` / `guard <file>` / `backfill [dir]` / `mcp` / `version`
- scaffold 出的專案**不含** bun/node 依賴：settings.json 與 .mcp.json 的 command 用 init 當下的 `process.execPath` 絕對路徑
- 目標平台僅 `bun-darwin-arm64`；發佈通路 GitHub Releases + `install.sh`
- 模板中的變數以 `{{PALACE_BIN}}` 佔位、init 時替換
- 文件 zh-Hant-TW

## 檔案結構

```
tools/cli/palace.ts              # Task 23  子指令 dispatcher（binary entry）
tools/assets/                    # Task 24  可參數化模板（text import）
  skill-digest.md / claude-md.md / settings-json.tmpl / mcp-json.tmpl / gitignore.tmpl
tools/lib/bootstrap.ts           # Task 25  palace init 的完整 bootstrap
scripts/build.ts                 # Task 26  bun build --compile 包裝
.github/workflows/release.yml    # Task 26  tag → build → release
install.sh                       # Task 26  curl 安裝腳本
docs/manual/phase-3.html         # Task 27  說明書
```

---

### Task 23: `palace` CLI dispatcher

**Files:** Create `tools/cli/palace.ts`, `tools/cli/palace.test.ts`；Modify `package.json`（scripts 加 `"palace": "bun tools/cli/palace.ts"`）

**Interfaces:**
- Consumes: 全部既有 lib/hook 模組（runStopHook 等純函式與各 CLI 的核心函式）
- Produces: `main(argv: string[]): Promise<number>`（回傳 exit code，可測）；binary entry `if (import.meta.main) process.exit(await main(process.argv.slice(2)))`
- 子指令路由（重用既有邏輯，不重寫）：
  - `hook stop|precompact|sessionend|sessionstart` → 呼叫對應 hooks 的入口邏輯（把各 hook 的 `import.meta.main` 區塊抽成 exported `runXxxEntry(): Promise<void>`，palace 與原檔入口都呼叫它——原 `bun tools/hooks/*.ts` 路徑保持可用）
  - `reindex [vault]` / `lint [vault]` / `guard <file>` / `backfill [dir]` → 同樣抽出各 CLI 的 `runXxxCli(args): number` 再由兩邊呼叫
  - `mcp` → tools/mcp/server.ts 的 `startServer()`（已存在，export 之）
  - `version` → 印出版本（tools/lib/version.ts 常數，單一真理）
  - 未知子指令 → usage 到 stderr、exit 2
- 測試：路由層以 mock 注入驗證各子指令派發正確、未知指令 exit 2、`hook` 缺參數 exit 2

**Steps:** (1) 寫 dispatcher 失敗測試 → (2) RED → (3) 抽出各入口函式 + 實作 dispatcher → (4) 全套測試綠（既有 122 不回歸）→ (5) commit `feat: palace CLI 統一入口——子指令路由到既有模組`

---

### Task 24: 模板資產抽出與參數化

**Files:** Create `tools/assets/{skill-digest.md,claude-md.md,settings-json.tmpl,mcp-json.tmpl,gitignore.tmpl}`, `tools/lib/templates.ts`, `tools/lib/templates.test.ts`

**Interfaces:**
- `renderTemplate(name: TemplateName, vars: { PALACE_BIN: string }): string`——Bun text import（`import tpl from "../assets/x.md" with { type: "text" }`，compile 時自動內嵌），`{{PALACE_BIN}}` 全量替換
- 模板內容 = 現行 `.claude/skills/digest/SKILL.md` 與 `CLAUDE.md` 的**發佈版**：`bun tools/cli/guard.ts` → `{{PALACE_BIN}} guard`、`bun run reindex` → `{{PALACE_BIN}} reindex`、`bun run lint:vault` → `{{PALACE_BIN}} lint`、`bun run backfill` → `{{PALACE_BIN}} backfill`；settings tmpl 的四支 hooks command → `{{PALACE_BIN}} hook <name>`；另加 `permissions.allow: ["Bash({{PALACE_BIN}}:*)"]`（headless digest 需要）；mcp tmpl command → `{{PALACE_BIN}}`、args `["mcp"]`
- autodigest 適配：`DIGEST_CMD` 的 `--allowedTools` 改為動態——偵測 `process.execPath` 是否為編譯後 binary（`!process.execPath.endsWith("/bun")`）：binary 模式用 `Bash(${process.execPath}:*)` 與既有 bun 清單並列（兩份都給，向下相容）
- 測試：每個模板 render 後不含 `{{`、不含 `bun tools`、含替換後路徑；skill 模板含寫入契約關鍵句（防模板漂移）

**Steps:** TDD → commit `feat: 模板資產內嵌與 PALACE_BIN 參數化`

---

### Task 25: `palace init`（空資料夾 bootstrap）

**Files:** Create `tools/lib/bootstrap.ts`, `tools/lib/bootstrap.test.ts`；Modify `tools/cli/palace.ts`（接 init 子指令）

**Interfaces:**
- `bootstrap(targetDir: string, palaceBin: string): { created: string[]; skipped: string[] }`
- 行為（全部冪等、絕不覆寫既有檔）：
  1. `mkdirSync(targetDir, { recursive: true })`；`scaffoldVault(join(targetDir, "vault"))`（重用 Task 6 模組）
  2. 寫 `.claude/settings.json`（settings tmpl；若已存在→skip 並警告）、`.claude/skills/digest/SKILL.md`、`CLAUDE.md`、`.mcp.json`、`.gitignore`（含 `.palace-state/`）
  3. 目標非 git repo → `git init`（guard 依賴 git；git 不存在時警告但不失敗）
  4. 回報下一步指引（stdout：填 identity.md、開 Obsidian、掛 MCP）
- `palace init [dir]`：dir 預設 cwd；palaceBin = `process.execPath`（開發模式下（execPath 是 bun）用 `bun ${palace.ts 絕對路徑}` 形式，模板照樣可用）
- 測試：空 temp dir → bootstrap → (a) 檔案齊全且 settings/mcp 內含 palaceBin 絕對路徑、無 `{{` 殘留；(b) `lintVault` 0 errors；(c) 二次執行全 skip；(d) 既有 CLAUDE.md 不被覆寫

**Steps:** TDD → commit `feat: palace init——空資料夾一鍵建立記憶系統`

---

### Task 26: build 與發佈管線

**Files:** Create `scripts/build.ts`, `.github/workflows/release.yml`, `install.sh`；Modify `package.json`（`"build": "bun scripts/build.ts"`）, `tools/lib/version.ts`

**Interfaces:**
- `bun run build` → `bun build --compile --target=bun-darwin-arm64 tools/cli/palace.ts --outfile dist/palace`；印出檔案大小；dist/ 進 .gitignore
- **compiled binary smoke test（本任務驗收核心）**：build 後在 temp dir 執行 `dist/palace init` → 檢查產物 + `dist/palace lint` 0 errors + `dist/palace version`；echo initialize JSON-RPC | `dist/palace mcp` 回 initialize response；`echo '{}' | dist/palace hook sessionstart` 輸出 additionalContext——寫成 `scripts/smoke.ts` 供 CI 與人工使用
- `release.yml`：on push tags `v*` → macos-14 runner → bun install → bun test → bun run build → smoke → `gh release create` 上傳 `palace-darwin-arm64` + install.sh
- `install.sh`：偵測 darwin/arm64 → 從 GitHub Releases 下載最新 `palace-darwin-arm64` → `chmod +x` → 裝到 `~/.local/bin/palace`（PATH 提示）；`set -euo pipefail`；REPO 變數置頂可改
- 測試：smoke.ts 本身就是測試；version.ts 單元測試

**Steps:** build script → 實際 build + smoke 全綠 → workflow + install.sh（shellcheck 心智檢查）→ commit `feat: 編譯發佈管線——bun compile、release workflow、install.sh`

---

### Task 27: Phase 3 說明書 + 端到端驗收

**Files:** Create `docs/manual/phase-3.html`

- 說明書（沿用 phase-1/2 品質標準：自包含、雙主題、responsive、zh-Hant-TW、非程式碼導向）必含：
  1. Phase 3 是什麼：從「開發者的 repo」到「人人可用的工具」
  2. 安裝：curl 一行安裝 / 手動下載 GitHub Releases；驗證 `palace version`
  3. 快速開始：`mkdir my-memory && cd my-memory && palace init` → 填 identity → 開始使用（hooks 自動生效於該資料夾的 Claude Code session）
  4. 指令對照表：舊 `bun run xxx` ↔ 新 `palace xxx`（開發模式仍可用 bun）
  5. 多 vault：不同資料夾各自 init 即各自獨立記憶系統；MCP 掛載時用 PALACE_VAULT 指定
  6. Troubleshooting：macOS Gatekeeper（xattr -d com.apple.quarantine）、PATH、升級方式（重跑 install.sh）
- 端到端驗收：`bun test` 全綠、`bun run lint:vault` 0 errors、`bun run build` + `bun scripts/smoke.ts` 全綠、真實 temp dir 用 dist/palace init 建出的專案跑 `dist/palace lint` 0 errors
- Commit `docs: Phase 3 HTML 使用說明書`

---

## 驗收總表

| 驗收項 | 對應 |
|---|---|
| 空資料夾 → palace init → 完整可用系統（lint 0 errors） | Tasks 25, 26 smoke |
| 免 bun 執行（compiled binary 跑 init/hook/mcp/lint） | Task 26 smoke |
| 既有 122 測試不回歸 | 每 task |
| GitHub Releases 發佈路徑（workflow + install.sh） | Task 26 |
| Phase 3 HTML 說明書 | Task 27 |

## Branch 策略

`phase-3`（自 phase-2 分出）；完成後保留，不自動 merge。實際 GitHub release 需使用者建立 remote 與 push tag——workflow 就緒即可。
