# EleGent：個人記憶系統 CLI（本 repo 是工具原始碼，不是活的 vault）

`elgt` 是個人記憶系統工具：`elgt init` 會在**使用者自己的資料夾**裡建立雙受眾 markdown vault（`vault/projects|areas|resources|archives` PARA，給人 + `vault/palace/` 記憶宮殿，給 LLM）。這個 repo 本身是產生它的工具原始碼，不會永久帶著一份活的 vault。

## 你在這個 repo 的角色

你是 `elgt` 的開發者，不是 vault 圖書館員：實作/測試 `tools/` 下的 CLI、hooks、MCP server，並維護 `tools/assets/` 裡的模板。**改 vault 使用者會看到的行為（CLAUDE.md、settings.json、skill 文字等），要改 `tools/assets/` 裡對應的模板檔，不要以為改這個 repo 根目錄的 CLAUDE.md 有用**——根目錄這份只給「開發這個工具」的情境用。

## 目錄

- `tools/cli/` — `elgt` 子指令入口（`init`/`reindex`/`lint`/`guard`/`backfill`/`mcp`/`hook`）
- `tools/lib/` — 核心邏輯：`bootstrap`（init 流程）、`scaffold` 呼叫的 vault 骨架、`indexgen`、`lint`、`frontmatter` 等
- `tools/hooks/` — Claude Code hooks（stop/precompact/sessionend/sessionstart），供 `elgt init` 寫進使用者 vault，也在這個 repo 自己的 `.claude/settings.json` 掛著跑（dogfood）
- `tools/mcp/` — `elegent-memory` MCP server
- `tools/assets/` — **vault 模板來源**：`claude-md.md`、`settings-json.tmpl`、`mcp-json.tmpl`、`gitignore.tmpl`、`skill-digest.md`，`elgt init` 逐字（`{{ELEGENT_BIN}}` 除外）寫進使用者的新 vault 根目錄
- `scripts/build.ts` — 編譯出單一執行檔到 `dist/`（gitignored）；`scripts/smoke.ts` — 编译产物的 smoke test
- `docs/manual/index.html` — 給 `elgt` 使用者看的說明書（不是這個 repo 的開發文件）

## vault 格式規範（工具強制，`tools/lib/lint.ts` 會檢查）

- 每個非保留 `.md` 必有 frontmatter，`type` ∈ `note|moc|entity|raw-log|wake|daily`
- 內部連結一律 `[標題](相對路徑.md)`；禁 `[[wikilink]]`、`![[embed]]`
- 檔名 = 唯一 slug（小寫、`-`）；人味放 `title`/`aliases`
- entity 頁固定槽位：`## Facts`（時間性事實表：舊事實填 `valid_to` 作廢，絕不刪列）+ `## Links` + `## Citations`
- `index.md` 是生成物（`reindex`），不要手改；導覽在 `palace/map.md`
- `user_managed: true` 的檔只讀

## 本地驗證：vault/ 只在本地，不進 git

`bun run scaffold`（或 `bun tools/cli/elgt.ts init .`）會在這個 repo 根目錄建立一份 `vault/`，供你手動驗證 `lint`/`reindex`/hooks 的行為。**這份 vault 只是本地測試用的實例，已加進 `.gitignore`，不要 commit**；`lint:vault`、`reindex` 沒帶參數時預設就是操作 `./vault`。要重來就直接刪掉整個 `vault/` 資料夾再重跑 scaffold。

## 工具

- `bun test`（全部測試）｜`bun run build`（產出 `dist/elgt`）｜`bun run smoke`
- `bun run scaffold [dir]`（本地建一份 vault 供驗證，預設 `./vault`）
- `bun run lint:vault [vault]`（兩級 lint）｜`bun run reindex [vault]`
- `bun run backfill [projectsDir]`（補檔歷史 session）｜`bun tools/cli/guard.ts <file>`（檢查是否違反 `palace/raw` append-only 規則）
