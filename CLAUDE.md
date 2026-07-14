# EleGent：個人記憶系統 CLI（本 repo 是工具原始碼，不是活的 vault）

`elgt` 是個人記憶系統工具：`elgt init` 會在**使用者自己的資料夾**裡建立雙受眾 markdown vault（`vault/projects|areas|resources|archives` PARA，給人 + `vault/palace/` 記憶宮殿，給 LLM）。這個 repo 本身是產生它的工具原始碼，不會永久帶著一份活的 vault。

## 你在這個 repo 的角色

你是 `elgt` 的開發者，不是 vault 圖書館員：實作/測試 `src/` 下的 CLI、hooks、MCP server，並維護 `src/assets/` 裡的模板。**改 vault 使用者會看到的行為（settings/hooks JSON、skill 文字、MCP 片段等），要改 `src/assets/` 裡對應的模板檔或 core 的 merge/render 函式，不要以為改這個 repo 根目錄的 CLAUDE.md 有用**——根目錄這份只給「開發這個工具」的情境用。

## 目錄（explicit architecture 三區塊；依賴一律向內，`src/architecture.test.ts` 用測試強制）

Graça Explicit Architecture 的三個頂層區塊逐字為 **Core / Presentation / Infrastructure**（`driving`/`driven` 是 Hexagonal 對 adapter 方向的形容詞，不是區塊名；adapter 一律在 Core 之外）。依賴一律向內：**presentation → core ← infrastructure**。core 是最內層、**不得 import presentation/infrastructure，也不得碰 `node:fs`／`Bun.spawn`**（I/O 一律走 port）；infrastructure（secondary adapter 側）不得反向 import presentation；presentation 是組裝根、可 import 任何一層並注入 infrastructure 實作。跨 block 一律走 `@core/*`、`@presentation/*`、`@infrastructure/*` 別名（見 `tsconfig.json` paths）。三條規則都由 `src/architecture.test.ts` 用測試強制（違反就 build fail）。

- `src/core/` — **Application Core**（純邏輯，不碰 fs/spawn/os/presentation/infrastructure）。第二層依 EA 分 Domain／Application 兩層（承載 Domain←Application 相依界線；單一 bounded context 故省略 `Component/<Context>/`）：
  - `domain/` — 純規則／VO（零外部相依）：`frontmatter`（note 格式不變式）、`safety`（sanitize/slug/path 驗證）、`dates`、`noise`、`guard`（append-only 增量規則）
  - `application/` — 用例（一律經 port 做 I/O）：`bootstrap`（init）、`scaffold`、`indexgen`、`lint`、`wake`、`templates`；`application/transcript/` = 歸檔 feature slice：`transcript`（`writeConversationArchive`／`renderTurns`／`RenderedTranscript` VO）＋ `claude`/`codex`/`agy`（把自家 transcript 格式翻成 `RenderedTranscript` 的純翻譯器，加新 CLI＝多一支）
  - `ports.ts`（Core 對外 port：`FileStore`＝刻意的薄抽象、`GitRunner`＝domain 化 git、`CodexSessionLocator`＝定位 Codex rollout、`McpRegistrar`＝用官方 `claude`/`codex mcp add` 註冊）與 `version.ts`（跨層共用常數）留 core 根當邊界／共用值
- `src/presentation/` — **Presentation / User Interface**（叫 app 動作；組裝根，import infrastructure adapter 注入 core）：
  - `cli/` — `elgt` 子指令入口（`init`/`reindex`/`lint`/`guard`/`backfill`/`mcp`/`hook`）＋ `scaffold` dev 入口
  - `hooks/` — 各 CLI lifecycle hooks，**後端＝資料夾、事件＝檔名**：`claude/{stop,precompact,sessionend,sessionstart}.ts`、`codex/{stop,precompact}.ts`、`agy/hook.ts`（各後端以一隻薄 `hook.ts` 或 `hook` 為共用入口）＋ `hookio.ts`（hook 的 stdin/stdout 交付邊界，只有 hooks 用）。CLI route 平權：`elgt hook <claude|codex|agy> <event>`（裸 `hook <event>` 為 deprecated 的 Claude 相容別名）。dogfood 掛在 `.claude/settings.json`／`.codex/hooks.json`／`.agents/hooks.json`。
  - `mcp/` — `elegent-memory` MCP server（stdio）
- `src/infrastructure/` — **Infrastructure**（secondary/driven adapter 側；被 app 叫）：
  - `adapters/` — 真正實作 Core port 的 secondary adapter：`node-fs`（`FileStore`）、`node-git`（`GitRunner`）、`codex-sessions`（`CodexSessionLocator`，唯一知道 `~/.codex/sessions` 佈局的地方）、`agent-cli`（`McpRegistrar`，`Bun.spawnSync` 呼叫 `claude`/`codex mcp add`）
  - `state`（節流游標 + hooks.log）、`autodigest`（spawn `claude -p /digest`）＝未實作 Core port 的 infra helper
- `src/assets/` — **vault/config 模板來源**：`gitignore.tmpl.md`、`skill-digest.md`、`codex-mcp.tmpl.md`。`elgt init` 不再往使用者 vault 寫 `CLAUDE.md`/`AGENTS.md`/根 `.mcp.json`；agent 行為由 digest skill（寫入/策展）+ MCP server（查詢/定位）+ hooks/MCP config 承載。Claude/Codex/Antigravity 三方的 hooks 設定一律由 `src/core/application/config-merge.ts`（`mergeClaudeSettings`/`mergeCodexHooks`/`mergeAgyHooks`）冪等合併產生，不再走靜態模板；Codex project/local MCP 片段由 `renderCodexMcpToml` 產生。

## 多 agent CLI 支援（本 repo 自己 dogfood）

- 本 repo 的 `AGENTS.md` 是指向 `CLAUDE.md` 的 symlink（單一來源、零漂移），只服務「開發這個工具」的情境；使用者用 `elgt init` 建出的 vault 不再產生這兩個人設檔。
- 當使用者說「消化」「蒸餾」「digest」「整理記憶」時，先讀 `.codex/skills/digest/SKILL.md`（Codex）、`.claude/skills/digest/SKILL.md`（Claude）或 `.agents/skills/digest/SKILL.md`（Antigravity/agy）；這三個檔都應 symlink 到 `src/assets/skill-digest.md`，讓 digest 流程只有單一來源。
- `.codex/hooks.json` 是 Codex CLI 的 hooks 設定；`.agents/hooks.json` 是 Antigravity (agy) 的 hooks 設定。**注意 Codex 的 hook trust** 與 **Antigravity 的 hook trust**：專案層 `.codex/` / `.agents/` 的 hooks 首次要在各自 CLI 內用 `/hooks` 檢視或執行前信任後才會執行。
- `scripts/build.ts` — 編譯出單一執行檔到 `dist/`（gitignored）；`scripts/smoke.ts` — 编译产物的 smoke test
- `docs/manual/index.html` — 給 `elgt` 使用者看的說明書（不是這個 repo 的開發文件）

## vault 格式規範（`src/core/application/lint.ts` + `src/core/domain/frontmatter.ts`）

以下規則不是每一條都被 `elgt lint` 機器強制——有些只是約定，改壞了 lint 不會報錯：

- 每個非保留 `.md` 必有 frontmatter，`type` ∈ `note|moc|entity|raw-log|wake|daily`（**lint 強制**：`type-vocab`/`frontmatter-parse`）
- 內部連結一律 `[標題](相對路徑.md)`；禁 `[[wikilink]]`、`![[embed]]`（**lint 強制**：body 出現 wikilink 是硬錯誤；斷鏈只是警告）
- 檔名 = 唯一 slug（小寫、`-`）；人味放 `title`/`aliases`（純約定，lint 不檢查檔名格式）
- entity 頁固定槽位：`## Facts`（時間性事實表：舊事實填 `valid_to` 作廢，絕不刪列）+ `## Links` + `## Citations`（純約定；lint 只在 `## Facts` 區塊存在時檢查日期區間沒顛倒，不檢查三個槽位是否存在）
- `index.md` 是生成物（`reindex`），不要手改；導覽在 `palace/map.md`（純約定，lint 不檢查 index.md 是否被手改過）
- `user_managed: true` 的檔只讀（由獨立指令 `elgt guard <file>` 比對 git HEAD 前後內容強制，不是 `lint`）

## 本地驗證：vault/ 只在本地，不進 git

`bun run scaffold`（或 `bun src/presentation/cli/elgt.ts init .`）會在這個 repo 根目錄建立一份 `vault/`，供你手動驗證 `lint`/`reindex`/hooks 的行為。**這份 vault 只是本地測試用的實例，已加進 `.gitignore`，不要 commit**；`lint:vault`、`reindex` 沒帶參數時預設就是操作 `./vault`。要重來就直接刪掉整個 `vault/` 資料夾再重跑 scaffold。

## 工具

- `bun test`（全部測試）｜`bun run build`（產出 `dist/elgt`）｜`bun run smoke`
- `bun run scaffold [dir]`（本地建一份 vault 供驗證，預設 `./vault`）
- `bun run lint:vault [vault]`（兩級 lint）｜`bun run reindex [vault]`
- `bun run backfill [projectsDir]`（補檔歷史 session）｜`bun src/presentation/cli/guard.ts <file>`（檢查是否違反 `palace/raw` append-only 規則）
