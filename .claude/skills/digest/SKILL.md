---
name: digest
description: 蒸餾 palace/raw 中未消化的對話/剪報進 PARA 與宮殿結構。當使用者說「消化」「蒸餾」「digest」「整理記憶」時使用。
---

# Digest：蒸餾流程

你是 vault 的圖書館員。把 `vault/palace/raw/` 的逐字證據蒸餾成結構化記憶。

## 找出未消化的檔案

讀 `.elegent-state/digest-cursor`（每行一筆 `<相對路徑>\t<該檔 bytes 大小>`，記錄的是上次消化完成當時的檔案大小；**檔案不存在視為空清單**）。列出 `vault/palace/raw/` 下所有 .md，排除保留檔 `index.md`/`log.md`；其餘（含 `type: raw-log` 與 `type: daily`）中，「不在游標中，**或**目前檔案大小 ≠ 游標記錄的大小」的都列入待辦——游標以檔案為單位會讓「消化後又長大的檔」（例如仍在成長的 session）永久被跳過，改成比對大小可以偵測到新增內容。重新蒸餾這類檔案時，寫入契約本來就會 skip 無新資訊的目標頁，所以只需自然補上淨新增內容。

## 每個檔案的蒸餾步驟

1. **讀取** raw 檔全文。
2. **路由（可行動性優先）**：先問「這服務哪個進行中的 project/area？」→ 寫進 `vault/projects/<slug>/` 或 `vault/areas/<slug>/` 的相關頁；都不是 → `vault/resources/<slug>/`；提到人/組織/工具的長期事實 → `vault/palace/entities/<slug>.md`。
3. **寫入契約（必守，順序執行）**：
   a. 先讀既有目標頁（不存在則建立，frontmatter 用統一模板（欄位：type/title/description/tags/timestamp/date/aliases/source/user_managed——完整規範見 CLAUDE.md 與設計文件 §3.2）、type 用封閉詞彙表）。
   b. 只合併「淨新增」資訊，保留既有內容；沒有新資訊就跳過不寫。
   c. 品質 rubric：禁臆測、禁「可能/大概/或許」模糊語、synthesize 不逐字複製、每則新知識在 `## Citations` 加來源連結（指向 raw 檔）。
   d. entity 事實表：更正 = 舊列填 `valid_to` + 追加新列，**絕不刪列**；同 predicate+object 且 valid_to 空白已存在 → 跳過。
   e. 寫完每個檔案立刻執行 `bun src/presentation/cli/elgt.ts guard <該檔路徑>`，違規就修正後重跑。
4. **更新宮殿**：
   - `vault/palace/map.md` 追加 pointer 行：`- 主題短語 | 實體;實體 | YYYY-MM-DD | →[標題](../相對路徑.md)`（行 ≤120 字元）。
   - 若活躍專案格局有變 → 重寫 `vault/palace/wake/essential-story.md`（≤15 條、≤3200 字元，聚焦「現在什麼最重要」）。
5. **記錄游標**：把該 raw 檔目前的 bytes 大小量出來，寫入/更新 `.elegent-state/digest-cursor` 中該檔對應的一行 `<相對路徑>\t<bytes 大小>`（若該檔已有舊紀錄則覆蓋該行，而非重複 append）。

## 全部完成後

1. `bun src/presentation/cli/elgt.ts reindex`
2. `bun src/presentation/cli/elgt.ts lint`——有硬錯誤必須修到 0
3. `vault/palace/log.md` 的今日段（無則建 `## YYYY-MM-DD`，newest first）加 `* **Ingest**: <一句摘要，N 個來源>`
4. 若 `vault/` 有被 git 追蹤（未被 `.gitignore` 排除）：`git add vault/ && git commit -m "digest: <摘要>"`；若 `vault/` 被排除在 git 之外（例如只是本地驗證用的實例），略過這步
5. 向使用者回報：蒸餾了哪些檔、更新了哪些頁、essential-story 是否重編譯。

## 禁止事項

- 不改 `user_managed: true` 的檔（identity.md）
- 不改 `vault/palace/raw/` 既有檔案（append-only 層）
- 不用 wikilink；內部連結一律 `[標題](相對路徑.md)`
- 不發明新的 frontmatter type
