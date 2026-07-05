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
