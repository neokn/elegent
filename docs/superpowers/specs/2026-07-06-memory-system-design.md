# 記憶系統設計文件（PARA × 記憶宮殿）

日期：2026-07-06
狀態：已與使用者逐節確認（四節全數通過）
參考研究：[MemPalace 可移植設計清單](../../research/mempalace-portable-designs.md)、[OKF × Obsidian 雙相容性分析](../../research/okf-obsidian-compat.md)

## 1. 目標與定位

依 `ref/LLM-wiki` 的模式打造個人記憶系統：LLM 增量建造並維護一個持久、複利累積的 markdown 知識庫，取代「每次查詢都從頭檢索」的 RAG 模式。知識編譯一次、持續維護；交叉引用與矛盾標記在 ingest 時就完成。

**記憶對象（四類）**：策展的外部知識、與 LLM 的對話記憶、個人生活與思考、工作與專案知識。

**核心框架——雙受眾**（使用者定調）：

- **PARA 服務人**：LLM 用它幫使用者聚焦當下該做的事、搜集整理資料。圖書館的閱覽室。
- **記憶宮殿服務 LLM**：讓 LLM 跨 session 記得事情的基礎設施。圖書館的書庫，人平常不進去，但管理員（LLM）靠它工作。

資訊流向：**宮殿餵養 PARA，PARA 校準宮殿**——蒸餾從 `palace/raw/` 讀證據，寫出 PARA 頁面（給人）與宮殿結構（給 LLM）；反向，`essential-story.md` 是從 PARA 活躍 projects 編譯出的視圖，讓 LLM 每個 session 都知道該幫使用者聚焦什麼。

## 2. 需求與已定決策

| 決策點 | 結論 |
|---|---|
| 儲存 | 純 markdown，**無向量檢索**（明確拒絕；grep/索引導航取代） |
| 保存策略 | 雙層：逐字 raw 層 + 蒸餾 wiki 層 |
| 格式 | 同時符合 **OKF spec** 與 **Obsidian** 格式；可用 obsidian skill + obsidian-cli 操作 |
| 內部連結 | **標準 markdown 相對連結** `[標題](相對路徑.md)`；禁用 wikilink 與 `![[embed]]`（Obsidian 設定關閉 wikilink 生成；事後可用轉換器無損反悔） |
| 自動捕捉 | Claude Code hooks（Stop / PreCompact / SessionEnd） |
| 跨產品取用 | Phase 2 本機 stdio MCP server（Claude Desktop、Codex CLI、Gemini CLI 等） |
| 手機/異地 | 只需瀏覽：Obsidian mobile + git sync；不做 remote MCP |
| 程式語言 | **一律 Bun + TypeScript**（hooks、render、index 重生、lint、MCP server；測試用 `bun:test`） |
| 落地位置 | 本 repo；`vault/` 子目錄為 Obsidian vault 根（`ref/` 不被索引）；repo 已 git init |
| 既有 knowledge-vault skill | 早期實驗，忽略 |

## 3. 架構

### 3.1 目錄結構

```
llm-wiki/                      # repo 根：系統的家
├── vault/                     # Obsidian vault 根 = OKF bundle
│   ├── projects/<slug>/       # P：短期、有目標、會結束（給人）
│   ├── areas/<slug>/          # A：持續責任（給人）
│   ├── resources/<slug>/      # R：策展的外部知識主題（給人）
│   ├── archives/              # A：完結的 P/A/R 整資料夾搬入（lint 建議搬移）
│   ├── palace/                # 記憶宮殿（給 LLM）
│   │   ├── wake/
│   │   │   ├── identity.md        # L0：我是誰、關鍵的人、原則（user_managed: true）
│   │   │   └── essential-story.md # L1：現在什麼重要；由蒸餾流程從 PARA 重編譯
│   │   ├── entities/          # 人/組織/工具：時間性事實表
│   │   ├── raw/               # 逐字證據層：不可變、append-only、按時間
│   │   │   ├── conversations/<project-slug>/YYYY-MM-DD_<session_id>.md
│   │   │   ├── clippings/     # Web Clipper 剪報
│   │   │   └── journal/       # 使用者手寫原始輸入
│   │   ├── map.md             # closet pointer 式壓縮索引（type: moc，LLM 掃描用）
│   │   ├── index.md           # OKF §6 格式，確定性自動重生
│   │   └── log.md             # OKF §7 格式：## YYYY-MM-DD + * **Ingest**: …
│   └── index.md               # root index，frontmatter 僅 okf_version
├── tools/                     # Bun + TS：hooks、render、lint、index 重生、(Phase 2) MCP
├── docs/                      # 本設計文件與研究
└── ref/                       # 唯讀參考資料（vault 外，Obsidian 不索引）
```

組織原則（自 MemPalace 研究的核心 reframing）：**資料夾只是被選為主要瀏覽軸的那一軸**——資料夾軸給 PARA（人類按可行動性瀏覽）；主題軸、實體軸住在 frontmatter tags 與連結裡（LLM 靠 index/map 與連結導航）；視圖用 Obsidian Bases/Dataview 對 frontmatter 查詢生成。

### 3.2 檔案格式規範（OKF × Obsidian 雙相容 profile）

所有非保留 `.md`（`index.md`/`log.md` 除外）使用統一 frontmatter：

```yaml
---
type: entity            # OKF 唯一必填。封閉詞彙表：note|moc|entity|raw-log|wake|daily
title: Justin 的工作偏好
description: 工具選擇與開發流程上的長期偏好事實表。   # 一句話；index.md 逐字引用
tags: [palace/entity, person]        # YAML list、無 #、kebab-case、/ 巢狀、不以數字開頭
timestamp: 2026-07-06T14:30:00+08:00 # OKF：完整 ISO 8601 含時區
date: 2026-07-06                     # Obsidian Date 型，排序/過濾用（選填冗餘）
aliases: [Justin 偏好]               # Obsidian 保留欄位 = OKF 合法擴充
source: "claude-session:2026-07-06"  # provenance
user_managed: false                  # true = 人 pin 住，LLM 只讀；false = LLM 可重寫
---
```

規則：

- **type 是封閉詞彙表**，禁止 LLM 發明新 type（lint 硬檢查）。type = 文件種類，不是 PARA 位置；位置由資料夾承載，檔案搬家 type 不變。用途對照：`note` 一般頁、`moc` 導覽/索引頁（map.md 等）、`entity` 實體頁、`raw-log` 對話/剪報歸檔、`wake` 喚醒層、`daily` 日記（`palace/raw/journal/`）。
- **連結**：內部一律 `[標題](相對路徑.md)`，可帶 `#heading` / `#^block` 錨點；外部用 `[text](url)`；**關係連結放 body 的 `## Links` 段，不放 frontmatter**（Links 型 property 是兩邊唯一無法調和的點）。斷鏈允許（lint 軟提醒）——指向尚未寫的知識是 feature。
- **命名**：檔名 = 全 vault 唯一 slug（小寫、`-`、無空格）；人味靠 `title` + `aliases`。`index.md`/`log.md` 大量重名，obsidian-cli 對它們一律用 `path=` 定位。
- **固定 heading 槽位**：entity 頁 = `## Facts` + `## Links` + `## Citations`；讓 LLM 精準更新單段而非整檔重寫。
- **Obsidian 專屬語法分級**：綠（callout、GFM 表格、footnote、mermaid——優雅降級）；黃（`^block-id` 限 entities 事實表；`%%comment%%` 限 palace 內部檔）；紅（禁用 `[[wikilink]]`、`![[embed]]`）。
- **Obsidian 設定**：關閉 Use [[Wikilinks]]、New link format = Relative path、自動更新內部連結 = on。

### 3.3 Entity 時間性事實表（自 MemPalace temporal KG 移植）

`palace/entities/<slug>.md` 的 `## Facts` 段為 GFM 表格：

```markdown
| predicate | object | valid_from | valid_to | confidence | source |
|---|---|---|---|---|---|
| works_at | [ACME](../../areas/work-acme/index.md) | 2024-03-01 | | 1.0 | [對話](../raw/conversations/...) |
| prefers | pnpm | 2026-01-01 | | 0.9 | ... |
| lives_in | 台北 | 2020-01-01 | 2025-06-30 | 1.0 | ... |
```

不變量：`valid_to` 空白 = 目前仍成立；**更正 = 舊列填 `valid_to` + 追加新列，絕不刪列**；append 前查重（同 predicate+object 且 valid_to 空白則跳過）；倒置區間（valid_to < valid_from）為 lint 硬錯誤；日期一律 ISO 格式保證字串排序 = 時序。

### 3.4 索引三件組

- **`index.md`**（每資料夾一份）：OKF §6 格式（無 frontmatter、`# 分組` + `* [Title](link) - description`），由確定性演算法 bottom-up 自動重生（description 從各檔 frontmatter 逐字上提，零 LLM）。宣告為生成物——手改會被覆蓋。
- **`palace/map.md`**：closet pointer 式壓縮索引，一行一指標 `- 主題短語 | 實體;實體 | YYYY-MM-DD | →[連結](路徑.md#^block)`，由蒸餾流程追加（LLM 生成，品質高於 regex 抽取）。行 ≤120 字元、分片 ≤1500 字元（可驗證的長度約束，不承諾壓縮率）。格式規範以 4 句 TL;DR 置頂（規範即 prompt）。
- **`log.md`**：OKF §7 append-only 時間軸，`grep "^## " log.md | tail -5` 可讀最近動態。

索引是近似定位器；miss 時 fallback 到全文 grep——誠實的降級路徑。

## 4. 核心元件

### 4.1 捕捉生產線（hooks，Bun + TS）

| Hook | 觸發 | 策略 | 解決的漏洞 |
|---|---|---|---|
| Stop | 每次回應後 | 節流（每 15 則 user 訊息 render 一次）、背景執行 | 平時增量歸檔，零打擾 |
| PreCompact | context 壓縮前 | **同步**，跑完才放行 | 壓縮後逐字內容從 context 消失 |
| SessionEnd | session 結束 | 抓 stdin → 背景 detach → 立即回 `{}` | 短對話從未觸發前兩者 |

繼承 MemPalace 的實作細節：`stop_hook_active` 防迴圈、`.palace-state/${SESSION_ID}_last_save` 節流游標（`.palace-state/` 位於 repo 根、已 gitignore——機器狀態不進 vault 也不進版控）（成功存檔才推進）、session_id sanitize（僅 alnum/dash/underscore）與 transcript 路徑驗證防注入、從 JSONL 前 200 行的 `cwd` 取 leaf 推導專案 slug、重活一律背景化。Bun 冷啟 ~20-30ms，hooks 直接 `bun run`，不需要 MemPalace 的 shell wrapper + daemon 探測那套。

**Transcript render**（TS 重寫 MemPalace `render_jsonl.py` + `normalize.py` 精華）：
- 使用者與助理的對話文字**逐字保存**
- 工具呼叫壓成單行摘要；工具輸出截頭尾各 20 行（工具輸出可重現、全存會淹沒訊號）
- 雜訊剝除：`<system-reminder>`、`<command-message>` 等 Claude Code 注入物（regex 組照抄，line-anchored）
- 輸出含合規 frontmatter（`type: raw-log` + description + tags + timestamp）
- 檔名確定性 = 冪等：重複 render 覆寫同一檔

### 4.2 蒸餾流程（`/digest` skill）

Phase 1 手動觸發；Phase 2 由 SessionEnd 觸發背景 headless（`claude -p`）。流程：

1. 從 `.palace-state/` 游標找未消化的 raw 檔
2. **路由（PARA 可行動性優先）**：「這服務哪個進行中的 project/area？」→ 沒有才落 resources；提到人/工具 → entities
3. 寫入，遵守**寫入契約四規則**：先讀既有 → 只合併淨新增並保留既有 → 沒新資訊就不寫 → 寫前自我複審。加**品質 rubric**：禁臆測、禁 may/likely 模糊語、必附 `## Citations`、synthesize 不逐字複製
4. 更新 `essential-story.md`（若活躍專案有變）、追加 `map.md` pointer、重生 `index.md`（確定性）、append `log.md`

### 4.3 喚醒機制（SessionStart hook）

注入 `identity.md` + `essential-story.md` 串接，**總預算 ≤900 tokens**（lint 硬檢查；essential-story ≤15 條 / ≤3200 字元）。L2（按資料夾/tag 載入）與 L3（全文 grep）不注入、對話中按需觸發。優於 MemPalace（它無 SessionStart hook，靠 AI 記得主動呼叫）。

### 4.4 檢索介面（三件套）

`list`（看結構）→ `search`（grep 回 file:line 片段）→ `read`（只讀命中檔）。SOP：先 search 再 read、查詢分解多路（原句/同義詞/上位概念）再 LLM 去重重排、禁止全列全讀。Phase 1 = skill 約定 + obsidian-cli/grep；Phase 2 = 同三操作 + `wake` 包成本機 stdio MCP server（`@modelcontextprotocol/sdk`），介面形狀不變零遷移。

### 4.5 維護（lint skill + backfill）

**兩級 lint**：
- 硬錯誤：frontmatter 不可解析、缺 type、type 不在詞彙表、raw 層被改寫、動了 `user_managed: true`、事實表倒置區間、wake 超預算
- 軟提醒：缺 description、斷鏈、index 過期、孤兒頁、該搬 archives 的完結專案

**寫入護欄**（工具層強制，不靠自律）：既有 heading 不可消失、citations 只增不減、違反回結構化錯誤讓 LLM 修正。

**backfill 指令**：掃描 `~/.claude/projects/` 有 JSONL 但 vault 未歸檔的 session 補檔——hooks 因此從「不能失敗的關鍵路徑」降級為「盡力而為的即時通道」。

**分級 human-in-the-loop**：日常 append（raw/log）直接寫 + git commit 可回滾；批次重寫（重構 entities、改使用者可見內容）走 branch + `git diff` 人審再 merge。

## 5. 錯誤處理

1. Hooks 絕不擋對話：內部錯誤一律 catch、輸出 `{}` 放行、錯誤寫 `.palace-state/hooks.log`
2. 冪等性：確定性檔名 + 蒸餾游標，重跑安全
3. 寫入護欄回結構化錯誤（見 4.5）
4. Git 是最後防線

## 6. 驗收標準（Phase 1 完成的定義）

- `bun test` 通過：JSONL 解析、雜訊剝除、專案名推導、路徑 sanitize（真實 transcript fixtures）
- 效能：Stop/SessionEnd 前景 <500ms；PreCompact 同步但有上限
- Wake 注入 ≤900 tokens（lint 硬檢查）
- 端到端：真實 session 自動出現在 `palace/raw/` → `/digest` 產出通過兩級 lint → 新 session wake 自動注入 → 已蒸餾事實三步內檢索到
- 全 vault 通過 OKF conformance lint + Obsidian 正常渲染（graph、backlinks、properties）

## 7. 階段規劃

- **Phase 1（驗證模式）**：vault 結構 + 格式規範文件（含 type 詞彙表、寫入契約、檢索 SOP）+ 捕捉 hooks + SessionStart wake + `/digest` skill + lint skill + backfill
- **Phase 2（自動化與外接）**：SessionEnd 自動蒸餾（headless）+ 本機 stdio MCP server + index 重生排程

只有兩處需要程式碼：hooks/工具（確定性、無 LLM）與 Phase 2 的薄 MCP server。其餘是 markdown 慣例 + LLM 遵守慣例——schema 文件是系統的原始碼，LLM 是它的直譯器。Phase 1 的風險不在技術，在慣例設計是否好用，以真實使用驗證。

## 8. 主要設計來源對照

| 來源 | 採用 | 捨棄 |
|---|---|---|
| LLM-wiki 想法文件 | 三層架構（raw/wiki/schema）、ingest/query/lint 三操作、index+log、答案回填 wiki | — |
| PARA（Forte） | 四資料夾為人類瀏覽軸、可行動性路由規則、project list ≈ essential-story | — |
| MemPalace | 宮殿分層（→ 雙受眾映射）、closet pointer（→ map.md）、L0-L1 wake、hooks 三件組骨架、temporal fact table、slug 正規化、逐字教條（限對話文字） | ChromaDB/向量檢索、AAAK dialect 格式、hall 分類、切塊（800 char chunk）、數值權重排序 |
| knowledge-catalog / OKF | OKF frontmatter profile、index/log 保留格式、user_managed、固定 heading 槽位、寫入契約四規則、品質 rubric、list/search/read 三件套、查詢分解、兩級 lint、四特性宣言（Readable/Parseable/Diffable/Portable） | mdcode 雙向同步、viz.html、embedding 層、受控爬蟲（暫緩） |
