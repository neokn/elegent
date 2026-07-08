# EleGent：個人記憶系統 CLI（本 repo 是工具原始碼，不是活的 vault）

`elgt` 是個人記憶系統工具：`elgt init` 會在**使用者自己的資料夾**裡建立雙受眾 markdown vault（`vault/projects|areas|resources|archives` PARA，給人 + `vault/palace/` 記憶宮殿，給 LLM）。這個 repo 本身是產生它的工具原始碼，不會永久帶著一份活的 vault。

## 你在這個 repo 的角色

你是 `elgt` 的開發者，不是 vault 圖書館員：實作/測試 `tools/` 下的 CLI、hooks、MCP server，並維護 `tools/assets/` 裡的模板。**改 vault 使用者會看到的行為（CLAUDE.md、settings.json、skill 文字等），要改 `tools/assets/` 裡對應的模板檔，不要以為改這個 repo 根目錄的 CLAUDE.md 有用**——根目錄這份只給「開發這個工具」的情境用。

## 目錄（explicit architecture 三區塊；依賴一律向內，`tools/architecture.test.ts` 用測試強制）

Graça Explicit Architecture 的三個頂層區塊逐字為 **Core / Presentation / Infrastructure**（`driving`/`driven` 是 Hexagonal 對 adapter 方向的形容詞，不是區塊名；adapter 一律在 Core 之外）。依賴一律向內：**presentation → core ← infrastructure**。core 是最內層、**不得 import presentation/infrastructure，也不得碰 `node:fs`／`Bun.spawn`**（I/O 一律走 port）；infrastructure（secondary adapter 側）不得反向 import presentation；presentation 是組裝根、可 import 任何一層並注入 infrastructure 實作。跨 block 一律走 `@core/*`、`@presentation/*`、`@infrastructure/*` 別名（見 `tsconfig.json` paths）。三條規則都由 `tools/architecture.test.ts` 用測試強制（違反就 build fail）。

- `tools/core/` — **Application Core**（純邏輯，不碰 fs/spawn/os/presentation/infrastructure）。`bootstrap`（init 流程）、`scaffold`（vault 骨架）、`indexgen`、`lint`、`guard`、`wake`、`transcript`（`writeConversationArchive`／`renderTurns`）、`frontmatter`/`dates`/`noise`/`safety`（domain VO/helper）、`templates`/`version`；`ports.ts` 定義 core 對外的 port（`FileStore`＝刻意的薄抽象、`GitRunner`＝domain 化的 git 動作、`CodexSessionLocator`＝定位 Codex rollout），由 presentation 注入 infrastructure 的實作。
  - `tools/core/parsers/` — 每個 agent CLI 一支具名逐字稿翻譯器：`claude`、`codex`，各自把自家 transcript 格式解析成 Core 自有的 `RenderedTranscript`（純函式、無 I/O，屬 Core 的 anti-corruption 翻譯，故留在 Core、不叫 adapter）。加新 CLI＝多一支 parser。
- `tools/presentation/` — **Presentation / User Interface**（叫 app 動作；組裝根，import infrastructure adapter 注入 core）：
  - `cli/` — `elgt` 子指令入口（`init`/`reindex`/`lint`/`guard`/`backfill`/`mcp`/`hook`）＋ `scaffold` dev 入口
  - `hooks/` — 各 CLI lifecycle hooks，**後端＝資料夾、事件＝檔名**：`claude/{stop,precompact,sessionend,sessionstart}.ts`、`codex/{stop,precompact}.ts`（各後端一支薄 `hook.ts` 為共用入口）。CLI route 平權：`elgt hook <claude|codex> <event>`（裸 `hook <event>` 為 deprecated 的 Claude 相容別名）。dogfood 掛在 `.claude/settings.json`／`.codex/hooks.json`。
  - `hookio.ts` — hook 的 stdin/stdout 交付邊界（primary/driving 交付機制，屬 UI 側）
  - `mcp/` — `elegent-memory` MCP server（stdio）
- `tools/infrastructure/` — **Infrastructure**（secondary/driven adapter 側；被 app 叫）：
  - `adapters/` — 真正實作 Core port 的 secondary adapter：`node-fs`（`FileStore`）、`node-git`（`GitRunner`）、`codex-sessions`（`CodexSessionLocator`，唯一知道 `~/.codex/sessions` 佈局的地方）
  - `state`（節流游標 + hooks.log）、`autodigest`（spawn `claude -p /digest`）＝未實作 Core port 的 infra helper
- `tools/assets/` — **vault 模板來源**：`claude-md.md`、`settings-json.tmpl`、`mcp-json.tmpl`、`gitignore.tmpl`、`skill-digest.md`、`codex-hooks.tmpl`，`elgt init` 逐字（`{{ELEGENT_BIN}}` 除外）寫進使用者的新 vault 根目錄；另會建 `AGENTS.md` symlink 指向使用者 vault 的 `CLAUDE.md`（Codex/Antigravity 都讀 AGENTS.md）

## 多 agent CLI 支援（本 repo 自己 dogfood）

- `AGENTS.md` 是指向 `CLAUDE.md` 的 symlink（單一來源、零漂移）：Claude Code 讀 `CLAUDE.md`、Codex CLI 與 Antigravity(`agy`) 只讀 `AGENTS.md`（都不讀 CLAUDE.md），拿到同一份開發指示。改內容一律改 `CLAUDE.md`。
- `.codex/hooks.json` 是 Codex CLI 的 hooks 設定（schema 與 Claude Code 相同：event → `matcher`?＋`hooks[]`）。**注意 Codex 的 hook trust**：專案層 `.codex/` 的 hooks 首次要在 CLI 內用 `/hooks` 檢視並信任後才會執行（或自動化時用 `--dangerously-bypass-hook-trust`）。
- `scripts/build.ts` — 編譯出單一執行檔到 `dist/`（gitignored）；`scripts/smoke.ts` — 编译产物的 smoke test
- `docs/manual/index.html` — 給 `elgt` 使用者看的說明書（不是這個 repo 的開發文件）

## vault 格式規範（工具強制，`tools/core/lint.ts` 會檢查）

- 每個非保留 `.md` 必有 frontmatter，`type` ∈ `note|moc|entity|raw-log|wake|daily`
- 內部連結一律 `[標題](相對路徑.md)`；禁 `[[wikilink]]`、`![[embed]]`
- 檔名 = 唯一 slug（小寫、`-`）；人味放 `title`/`aliases`
- entity 頁固定槽位：`## Facts`（時間性事實表：舊事實填 `valid_to` 作廢，絕不刪列）+ `## Links` + `## Citations`
- `index.md` 是生成物（`reindex`），不要手改；導覽在 `palace/map.md`
- `user_managed: true` 的檔只讀

## 本地驗證：vault/ 只在本地，不進 git

`bun run scaffold`（或 `bun tools/driving/cli/elgt.ts init .`）會在這個 repo 根目錄建立一份 `vault/`，供你手動驗證 `lint`/`reindex`/hooks 的行為。**這份 vault 只是本地測試用的實例，已加進 `.gitignore`，不要 commit**；`lint:vault`、`reindex` 沒帶參數時預設就是操作 `./vault`。要重來就直接刪掉整個 `vault/` 資料夾再重跑 scaffold。

## 工具

- `bun test`（全部測試）｜`bun run build`（產出 `dist/elgt`）｜`bun run smoke`
- `bun run scaffold [dir]`（本地建一份 vault 供驗證，預設 `./vault`）
- `bun run lint:vault [vault]`（兩級 lint）｜`bun run reindex [vault]`
- `bun run backfill [projectsDir]`（補檔歷史 session）｜`bun tools/driving/cli/guard.ts <file>`（檢查是否違反 `palace/raw` append-only 規則）
