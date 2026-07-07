# EleGent 改名設計文件（palace → EleGent / elgt）

日期：2026-07-07
狀態：已與使用者逐節確認
前置：[記憶系統設計文件](2026-07-06-memory-system-design.md)

## 1. 目標

將產品從「palace / llm-wiki」改名為 **EleGent**（Elephant + Agent——大象永不忘記，正好是記憶系統）。產品識別（CLI、MCP server、環境變數、建置產物、安裝管線、文件品牌）全面換新；**「記憶宮殿」（`vault/palace/`）是記憶架構概念、非產品名，完整保留**——品牌敘事順勢升級為「EleGent 是大象館員（產品），palace 是牠看守的記憶宮殿書庫（結構）」。

## 2. 已定決策

| 決策點 | 結論 |
|---|---|
| 改名範圍 | 產品識別全改；`vault/palace/` 記憶宮殿概念保留（使用者選定） |
| CLI 指令名 | **`elgt`**（使用者指定的短名，打字省力；品牌顯示一律 EleGent） |
| repo 名 | `neokn/llm-wiki` → **`neokn/EleGent`**（改名動作由使用者在 GitHub 操作；程式碼與文件內引用由本次改名對齊） |
| 相容性 | **無**——軟體未發佈，直接改；不做相容層、不寫遷移指令、不留舊名 fallback |
| 版本號 | 維持 `0.3.0`（未發佈過，不需要版本刻度） |
| 歷史文件 | 三份 phase 手冊、`docs/superpowers/`、`docs/research/` 保留原樣不回改 |

## 3. 識別字對照表

| 層面 | 現在 | 改為 |
|---|---|---|
| 品牌顯示名 | palace / llm-wiki | **EleGent** |
| CLI 執行檔與指令 | `palace` | **`elgt`** |
| CLI 入口源檔 | `tools/cli/palace.ts` | `tools/cli/elgt.ts`（測試檔同步） |
| `package.json` name | `llm-wiki` | `elegent` |
| `package.json` script | `"palace"` | `"elgt"` |
| 編譯產物 | `dist/palace` | `dist/elgt` |
| Release asset | `palace-darwin-arm64` | `elgt-darwin-arm64` |
| 安裝位置 | `~/.local/bin/palace` | `~/.local/bin/elgt` |
| MCP server 名 | `palace-memory` | `elegent-memory` |
| MCP 工具名 | `memory_wake/search/read/list` | 不變（不含品牌字樣） |
| 環境變數（5 個） | `PALACE_VAULT`、`PALACE_AUTO_DIGEST`、`PALACE_BIN`、`PALACE_COMPILED`、`PALACE_HEADLESS_DIGEST` | `ELEGENT_` 前綴同名對應 |
| 狀態目錄 | `.palace-state/` | `.elegent-state/`（`.gitignore` 同步） |
| GitHub repo（引用） | `neokn/llm-wiki` | `neokn/EleGent` |
| `vault/palace/`、`palace/*` tags、type 詞彙 | — | **不變** |

命名規約：品牌文案用 `EleGent`；指令與跟隨指令的檔名（CLI 源檔、編譯產物、asset）用小寫 `elgt`；env 前綴用大寫 `ELEGENT_`；MCP server 與 package name 用小寫全名 `elegent(-memory)`；程式內部識別字（函式、變數）用全名 `elegent`／`Elegent` 以保可讀性。

## 4. 改動範圍

### 4.1 程式碼與建置（約 29 個源檔＋對應測試）

- `tools/cli/palace.ts` → `tools/cli/elgt.ts`：USAGE 文字（`用法: elgt <command>`）、`resolvePalaceBin()` → `resolveElegentBin()` 等識別字；`palace.test.ts` → `elgt.test.ts`
- `tools/mcp/server.ts`：`SERVER_INFO.name = "elegent-memory"`；`ELEGENT_VAULT`
- `tools/lib/state.ts`：狀態目錄 `.elegent-state/`
- `tools/lib/autodigest.ts`、hooks 四件、`tools/lib/templates.ts`、`tools/lib/version.ts`：env 名、`buildDigestCmd`、模板參數 `ELEGENT_BIN`、compiled 判定 `ELEGENT_COMPILED` 與執行檔後綴清單
- `scripts/build.ts`：outfile `dist/elgt`、define；`scripts/smoke.ts` 同步
- `.github/workflows/release.yml`：asset 名 `elgt-darwin-arm64`、serverInfo/tag 版本一致性檢查中的名稱
- `install.sh`：`REPO="neokn/EleGent"`、`BIN_NAME="elgt"`、`ASSET_NAME="elgt-darwin-arm64"`、文案
- `.mcp.json`（本 repo）：server key `elegent-memory`
- `.claude/settings.local.json`：`enabledMcpjsonServers` 清單中的 `"palace-memory"` → `"elegent-memory"`
- 程式內中文註解與使用者可見訊息：指「產品／CLI」的 palace → EleGent／elgt；指「記憶宮殿／書庫結構」的保留

### 4.2 模板資產（`palace init` → `elgt init` 產出物）

- `tools/assets/claude-md.md`：標題與產品引用改（`elegent-memory`、`elgt`）；`vault/palace/` 結構說明、檢索 SOP、寫入契約保留
- `tools/assets/skill-digest.md`：同上原則
- settings.json / mcp.json / gitignore 模板：hook command、server key、`.elegent-state/` 忽略項

### 4.3 文件

- repo 根 `CLAUDE.md`：標題「EleGent：個人記憶系統」、`elegent-memory`、工具指令對照；`vault/palace/` 敘述保留
- `docs/manual/index.html`（整合手冊）：品牌全面改版——標題／hero／footer、所有指令範例（`elgt init` 等）、env 名、MCP 設定範例、install URL；第 1 章比喻微調（大象館員 × 記憶宮殿）
- 三份 phase 手冊與 `docs/research/`、`docs/superpowers/`：不回改

## 5. 不動範圍（palace 殘留白名單）

改名完成後，全 repo `grep -ri palace` 允許殘留且僅允許殘留於：

1. `vault/`（`palace/` 資料夾、tags、既有筆記內容）
2. `docs/manual/phase-1|2|3.html`（歷史手冊）
3. `docs/research/`、`docs/superpowers/`（歷史設計文件，含本檔的「現在」欄）
4. `ref/`（唯讀參考資料，含 mempalace-3.5.0）
5. 程式碼與模板中指涉「記憶宮殿結構」的 `vault/palace/` 路徑字串與相關中文敘述

## 6. 品牌敘事

- Hero 副標融入命名由來：「Elephant + Agent——一頭記性最好的大象館員」；「大象永不忘記」呼應「知識複利累積」
- 圖書館比喻架構不變：閱覽室（PARA）給人、書庫（palace 記憶宮殿）給 AI；EleGent 是看守書庫的館員
- CLI usage 與手冊語氣不變，只換名

## 7. 驗收標準

- `bun test` 全綠（含改名後的 `elgt.test.ts`）
- `bun run build` 產出 `dist/elgt`；`bun run smoke` 通過
- `bun run lint:vault` 通過（vault 未被觸碰的旁證）
- `elgt version` 印出 `0.3.0`；`elgt init` 在空資料夾產出的 `.mcp.json`／settings 指向 `elgt` 與 `elegent-memory`
- 全 repo `grep -ri palace` 殘留僅限第 5 節白名單
- 整合手冊 `docs/manual/index.html` 內無任何 `palace` 指令／env／server 名殘留（宮殿概念文字除外）
