---
name: digest
description: 蒸餾 palace/raw 中未消化的對話/剪報進 PARA 與宮殿結構。當使用者說「消化」「蒸餾」「digest」「整理記憶」時使用。
---

# Digest：蒸餾流程

你是 vault 的圖書館員。把 `vault/palace/raw/` 的逐字證據蒸餾成結構化記憶。

## 找出未消化的檔案

讀 `.palace-state/digest-cursor`（每行一個已消化的 raw 檔相對路徑；**檔案不存在視為空清單**）。列出 `vault/palace/raw/` 下所有 .md，排除：(a) 游標中已列出的檔；(b) 保留檔 `index.md`/`log.md`。其餘（含 `type: raw-log` 與 `type: daily`）一律列入待辦。

## 每個檔案的蒸餾步驟

1. **讀取** raw 檔全文。
2. **路由（可行動性優先）**：先問「這服務哪個進行中的 project/area？」→ 寫進 `vault/projects/<slug>/` 或 `vault/areas/<slug>/` 的相關頁；都不是 → `vault/resources/<slug>/`；提到人/組織/工具的長期事實 → `vault/palace/entities/<slug>.md`。
3. **寫入契約（必守，順序執行）**：
   a. 先讀既有目標頁（不存在則建立，frontmatter 用統一模板（欄位：type/title/description/tags/timestamp/date/aliases/source/user_managed——完整規範見 CLAUDE.md 與設計文件 §3.2）、type 用封閉詞彙表）。
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
