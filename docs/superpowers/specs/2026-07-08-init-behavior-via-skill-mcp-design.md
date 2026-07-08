# EleGent init 行為重構:vault 去 CLAUDE.md、行為改由 skill + MCP 承載

- 日期:2026-07-08
- 狀態:設計已定案,待實作規劃(writing-plans)
- 相關程式:`src/core/application/bootstrap.ts`、`src/core/application/templates.ts`、`src/presentation/cli/elgt.ts`、`src/presentation/cli/init-ui.tsx`、`src/presentation/mcp/server.ts`、`src/assets/*`

## 1. 背景與問題

EleGent 的核心價值是「**我在任何地方和 agent 對話都會被記錄**」。記錄本身由 hooks 完成(`Stop`/`PreCompact`/`SessionEnd`/`SessionStart`),與 vault 的 `CLAUDE.md` 完全無關——hooks 可裝在 user scope(`~/.claude/settings.json`)全域生效。

但目前 `elgt init` 有三個與這個定位相衝突的問題:

1. **vault 被塞進一份 agent 人設 `CLAUDE.md` + `AGENTS.md` symlink**(`bootstrap.ts` 的 `ROOT_RENDERED_FILES`、`CONTEXT_SYMLINKS`),不論 scope 都無條件寫入。`src/assets/claude-md.md` 裝的是「你是這個 vault 的圖書館員 + 格式鐵律 + 檢索 SOP」,只有當 cwd=vault 時才生效,和「隨處記錄」無關。使用者的實際對話多半發生在**別的專案資料夾**(各有自己的 `CLAUDE.md`),vault 不是一個「拿來開發的專案」,不該被強加 agent 人設。
2. **`skill-digest.md` 依賴 `CLAUDE.md`/`AGENTS.md`**:有 4 處寫「依 CLAUDE.md / AGENTS.md 的工具指令執行…」(第 19、23、31、32 行),與 vault 人設檔耦合。
3. **user scope 目前是空操作**:`bootstrap` 對每個檔都「存在就跳過」(`bootstrap.ts:152`)。既有使用者早就有 `~/.claude/settings.json`、`~/.codex/hooks.json` → init 直接跳過 → hooks 沒裝上 → 「隨處記錄」的賣點對他們根本沒生效。且預設 scope 是 `project`(`bootstrap.ts:137`),開箱即用時 hooks 只在 vault 內生效。

**本 repo 自己的根 `CLAUDE.md`/`AGENTS.md` 是開發用的,完全合理,不在本次變更範圍**——它們是「開發 elgt 這個工具」的指示,與 init 產物是兩種不同的東西。

## 2. 目標 / 非目標

### 目標
- `elgt init` **不再往使用者 vault 產生任何 agent 人設檔**(`CLAUDE.md`、`AGENTS.md`)。
- 所有 agent 行為改由 **skill + MCP** 承載,並依 init 選的 scope 寫到對應位置(project=vault、user=使用者全域設定)。
- 讓 user scope **真的能動**:寫進既有共用設定檔時採「加值式合併」,不覆寫、不跳過。
- 預設 scope 改為 `user`,兌現「隨處記錄」。
- 自動化 Claude/Codex 的 MCP 註冊(取代目前叫使用者手動加 `~/.codex/config.toml` 的步驟)。

### 非目標
- 不動本 repo 自己的根 `CLAUDE.md`/`AGENTS.md`(開發用)。
- 不自動化 Antigravity(`~/.gemini/config/mcp_config.json`)的 MCP 註冊——維持文件提示,列為後續。
- 不改 vault 的格式規範/lint 規則本身。
- 不處理 skill 內容的「更新既有安裝」問題(skip-if-exists 沿用現況)。

## 3. 核心心智模型

> **記錄(hooks)無條件全域;查詢與策展(MCP + skill)跟著 scope 走。**

- **記錄 = hooks**:預設 user scope → 到處都錄,歸檔回固定的 `ELEGENT_ROOT` vault。
- **查詢 = MCP**:`elegent-memory` server 的 `memory_list/search/read/wake` 就是檢索的實作;檢索 SOP 與 vault 定位放進 MCP server `instructions`(cwd=vault 時無條件在場,不靠 skill description 命中)。
- **策展/寫入 = digest skill**:格式鐵律、寫入契約、entity 事實表都在 skill 內,自我完備。
- **scope 一致原則**:init 選 `project`,三類東西(hooks/skill/MCP)都寫進 vault;選 `user`,都寫進使用者全域設定。MCP scope 直接對應 init scope(`project`→`--scope project`、`user`→`--scope user`),不另立 `local` 概念。

## 4. 設計細節

### 4.1 移除 vault 人設檔(A)

- `bootstrap.ts`:`ROOT_RENDERED_FILES` 移除 `{ rel: "CLAUDE.md", template: "claude-md" }`;`CONTEXT_SYMLINKS` 移除 `{ link: "AGENTS.md", target: "CLAUDE.md" }`(陣列清空 → symlink 迴圈自然 no-op,可一併移除該迴圈與 `store.symlink`/`lexists` 的相依,若無其他用途)。
- `templates.ts`:`TemplateName` union 移除 `"claude-md"`;刪除 `import claudeMd`、`TEMPLATES` map 中對應項。
- 刪除 `src/assets/claude-md.md`。
- **保留** `.gitignore` 的寫入(vault 仍需要)。

### 4.2 recall + 定位進 MCP instructions(B)

`src/presentation/mcp/server.ts`:

- `new McpServer(SERVER_INFO)` → `new McpServer(SERVER_INFO, { instructions: VAULT_INSTRUCTIONS })`(SDK `ServerOptions.instructions` 已確認支援)。
- `VAULT_INSTRUCTIONS` 為 server.ts 內的字串常數(不做成 vault 模板——它烤進 binary、不寫進使用者資料夾)。內容:vault 總覽(PARA + palace 雙受眾)+ 檢索 SOP(以 `memory_wake`/`memory_read palace/map.md`/`memory_search` 多路查詢/追 `palace/raw/` 表述)+ 「寫入一律走 /digest、index.md 是生成物別手改」的提醒。**刻意不重述完整格式鐵律**(留給 digest skill + lint 當唯一真理源,避免四處漂移)。
- 磨利 4 個 tool 的 `description`(例:`memory_search` 標註「多路查詢:原句+同義詞+上位概念」;`memory_wake` 標為「查詢起手式」)。

草稿(可於實作微調):

```
這是 EleGent 個人記憶 vault(雙受眾 markdown)。projects/areas/resources/archives = PARA(給人);palace/ = 記憶宮殿(給 LLM)。

查詢「我記得…嗎」SOP:
1. 先 memory_wake 拿 identity + 當前要事;或 memory_read `palace/map.md` 定位。
2. memory_search 多路查詢:原句 + 同義詞 + 上位概念(查一次不夠)。
3. 只 memory_read 命中的檔;需要證據追到 palace/raw/ 逐字紀錄。
4. 有價值的綜合值得回填——請使用者觸發 /digest 依寫入契約寫回 PARA。

不要自己改檔:寫入一律走 /digest skill(格式鐵律、entity 事實表、append-only raw 都在那)。index.md 是生成物(elgt reindex),別手改。
```

### 4.3 digest skill 自我完備(C)

`src/assets/skill-digest.md`:

- 拿掉對 `CLAUDE.md`/`AGENTS.md` 的 4 處引用(第 19、23、31、32 行),改為直接寫命令:`elgt guard <path>`、`elgt reindex`、`elgt lint`。
- 從 `claude-md.md` 搬入格式鐵律區塊:frontmatter 欄位表、`type` 封閉詞彙表(`note|moc|entity|raw-log|wake|daily`)、內部連結格式(`[標題](相對路徑.md)`、禁 wikilink/embed)、entity 固定槽位(`## Facts`/`## Links`/`## Citations`)、`user_managed: true` 只讀。
- 開頭「你是 vault 的圖書館員」保留,兼作定位。

### 4.4 scope-aware 安裝(D)

#### 4.4.1 scope → 落點對照

| 產物 | project scope | user scope | 寫入方式 |
|---|---|---|---|
| Claude hooks | `<vault>/.claude/settings.json` | `~/.claude/settings.json` | 冪等 JSON 合併(`mergeClaudeSettings`) |
| Codex hooks | `<vault>/.codex/hooks.json` | `~/.codex/hooks.json` | 冪等 JSON 合併(`mergeCodexHooks`) |
| Claude MCP | `claude mcp add --scope project`(cwd=vault → 寫 `<vault>/.mcp.json`) | `claude mcp add --scope user`(寫 `~/.claude.json`) | 官方 CLI(`McpRegistrar` port) |
| Codex MCP | 寫 `<vault>/.codex/config.toml` `[mcp_servers.elegent-memory]`(新模板,fresh) | `codex mcp add`(寫 `~/.codex/config.toml`) | user 走 CLI;project 寫檔(見 §9 開放問題) |
| digest skill | `<vault>/.claude/skills/digest/`、`<vault>/.codex/skills/digest/` | `~/.claude/skills/digest/`、`~/.codex/skills/digest/` | 建檔(skip-if-exists) |

`none` scope:該 agent 三類全不裝(現況語意不變)。

#### 4.4.2 hooks:冪等 JSON 合併

- 新增 **純函式**(放 `src/core/`,建議 `core/application` 或 `core/domain`,無 I/O):
  - `mergeClaudeSettings(existing: string | null, opts: { hookCommand: string; bashAllow: string }): string`
  - `mergeCodexHooks(existing: string | null, opts: { hookCommand: string }): string`
- 語意:`existing=null` → 產出全新檔;否則 parse 既有 JSON,對每個事件陣列**確保我方 hook 條目存在**(以 command 字串去重,重跑不重複),並確保 `permissions.allow`(Claude)含我方項。**只增不改不刪**使用者既有內容。回傳 pretty JSON。
- `bootstrap` 改為:對 settings.json/hooks.json 一律 `store.tryRead` → merge → `store.write`(project/user 同一路徑,`existing=null` 自然涵蓋新 vault)。取代原本的 skip-if-exists 寫入迴圈中這兩類檔。

#### 4.4.3 MCP:官方 CLI 註冊(新 port)

- 新增 core port `McpRegistrar`(`src/core/ports.ts`),形狀比照 `GitRunner`(回 `{ ok, detail }`):
  ```ts
  export interface McpRegistrar {
    /**
     * 用各 agent 的官方 CLI 註冊 elegent-memory MCP server。
     * scope 對應 init scope;project scope 需以 cwd=vaultRoot 執行(讓 --scope project 落在 vault)。
     * CLI 不存在或已註冊 → ok:false/alreadyExists,呼叫端據此組警告(比照 git,不中斷)。
     */
    registerClaude(opts: McpRegisterOpts): { ok: boolean; detail: string; alreadyExists?: boolean };
    registerCodex(opts: McpRegisterOpts): { ok: boolean; detail: string; alreadyExists?: boolean };
  }
  export interface McpRegisterOpts {
    scope: "project" | "user";
    vaultRoot: string;   // --env ELEGENT_VAULT=<vaultRoot>,project scope 也當 cwd
    elegentBin: string;  // `--` 之後的 command(可能兩段,如 "bun /abs/elgt.ts")+ "mcp"
  }
  ```
- infra adapter(`src/infrastructure/adapters/` 新增,如 `agent-cli.ts`)用 `Bun.spawn` 呼叫:
  - Claude:`claude mcp add --scope <s> --env ELEGENT_VAULT=<vault> elegent-memory -- <bin...> mcp`(flag 須在 server name 前)。
  - Codex:`codex mcp add --env ELEGENT_VAULT=<vault> elegent-memory -- <bin...> mcp`。
  - `elegentBin` 含空白時拆段接到 `--` 之後(開發模式 `bun /abs/elgt.ts`;編譯後單一路徑)。
- **冪等**:CLI 對已存在的同名 server 會報錯 → adapter 先 `claude mcp get`/`codex mcp list` 偵測,或容忍「already exists」錯誤,回 `alreadyExists:true` 當成功。
- **失敗降級**:`claude`/`codex` CLI 不存在或失敗 → `bootstrap` 收進 `warnings`,不中斷(比照 git init)。

#### 4.4.4 Codex MCP project 模板

- 新增 `src/assets/codex-mcp.tmpl`(TOML):
  ```toml
  [mcp_servers.elegent-memory]
  command = "{{ELEGENT_MCP_COMMAND}}"
  args = [{{ELEGENT_MCP_ARGS}}]

  [mcp_servers.elegent-memory.env]
  ELEGENT_VAULT = "{{ELEGENT_VAULT}}"
  ```
- 由 `renderTemplate` 或 bootstrap 內純函式 `renderCodexMcpToml(...)` 產出(需把 `elegentBin` 拆成 command + args 陣列,類似現有 `normalizeMcpJson` 的拆段);`TemplateName` 加 `"codex-mcp"`。
- 僅 Codex **project** scope 用;user scope 走 `codex mcp add`。

### 4.5 預設 scope → user(E)

- `bootstrap.ts:137-141`:`claudeScope`/`codexScope` 預設 `"project"` → `"user"`。
- `elgt.ts:209-210`(prompt defaults)、`parseInitArgs` 相關預設 → `"user"`。
- `init-ui.tsx`:`SCOPE_OPTIONS`/`Select` 的 `defaultValue` 對齊 `user`,文案微調(說明 user=隨處記錄)。
- `USAGE`(`elgt.ts:22`)文字更新預設值說明。

### 4.6 連帶清理(F)

- **刪除** `src/assets/mcp-json.tmpl` 與 `bootstrap.ts` 的 `normalizeMcpJson`(Claude `.mcp.json` 現由 `claude mcp add` 產生,不再手寫);`ROOT_RENDERED_FILES` 移除 `.mcp.json` 項;`TemplateName` 移除 `"mcp-json"`。
- `elgt.ts` init 完成訊息(約 `149-159` 行):移除「叫使用者手動加 `~/.codex/config.toml`」那段(已自動化);移除 AGENTS.md 相關字句;更新「重啟 Claude 掛 .mcp.json」為對應新流程。
- **修 dogfood 壞檔**:repo 根 `/.mcp.json` 指向已不存在的 `tools/mcp/server.ts` → 修為 `src/presentation/mcp/server.ts`(或改用符合新設計的形式)。
- repo 根 `CLAUDE.md`:更新描述 `src/assets/` 內容的那段(把 `claude-md.md`、`mcp-json.tmpl` 從清單移除,加 `codex-mcp.tmpl`)。
- `docs/manual/index.html`:更新給使用者的說明(init 不再產 CLAUDE.md;MCP 自動註冊)。
- 測試:移除 `bootstrap.test.ts`/`elgt.test.ts`/`templates.test.ts` 中對 CLAUDE.md/AGENTS.md/`.mcp.json` 生成的斷言;新增合併函式、`McpRegistrar`(注入 fake)、scope 路由的測試。`architecture.test.ts` 應仍通過(新 port 在 core、adapter 在 infra)。

## 5. 新抽象一覽

| 抽象 | 位置 | 職責 |
|---|---|---|
| `McpRegistrar`(port) | `src/core/ports.ts` | Core 對「用官方 CLI 註冊 MCP」的介面(shaped to needs) |
| agent-cli adapter | `src/infrastructure/adapters/agent-cli.ts` | 用 `Bun.spawn` 實作 `McpRegistrar`(claude/codex CLI) |
| `mergeClaudeSettings` / `mergeCodexHooks` | `src/core/`(純函式) | 冪等加值式 JSON 合併 hooks + permissions |
| `renderCodexMcpToml` + `codex-mcp.tmpl` | `src/core/application/templates.ts` + `src/assets/` | Codex project scope 的 config.toml 片段 |
| `VAULT_INSTRUCTIONS` | `src/presentation/mcp/server.ts` | MCP server instructions(定位 + 檢索 SOP) |

## 6. 邊界情況與失敗處理

- **`claude`/`codex` CLI 不存在**:MCP 註冊失敗 → `warnings`,init 不中斷;訊息提示使用者手動註冊(附指令)。
- **MCP server 已註冊**:偵測到 → 視為成功(`alreadyExists`),不報錯、不重複。
- **既有 settings.json/hooks.json 格式異常**(parse 失敗):merge 函式應回退為「不動既有檔、發警告」而非丟例外炸掉 init(避免毀損使用者設定)。
- **冪等**:整個 `bootstrap` 對同一 targetDir 重跑,`created` 應為空/穩定、既有內容不變、MCP 不重複註冊。
- **elegentBin 兩段式**(dev 模式 `bun /abs/elgt.ts`):MCP CLI 的 `--` 之後與 TOML args 都要正確拆段。
- **Codex project scope 信任警語**:`<vault>/.codex/config.toml` 與 `.codex/hooks.json` 同樣需在 Codex 內用 `/hooks` 信任專案後才載入——init 訊息保留此提示。

## 7. 測試策略

- **純函式**(無 I/O,直接斷言字串/JSON):`mergeClaudeSettings`/`mergeCodexHooks`(空輸入、既有含他人 hook、重跑去重、壞 JSON 回退)、`renderCodexMcpToml`(單段/兩段 bin)。
- **bootstrap**(注入 in-memory `FileStore` + fake `GitRunner` + fake `McpRegistrar`):
  - project scope:vault 內產出 settings/hooks/skill + Codex config.toml;registrar 收到 `claude --scope project`。
  - user scope:合併進(fake 的)`~/.claude/settings.json`;registrar 收到 `--scope user`;不產 vault 內 hook 檔。
  - 不再產出 CLAUDE.md/AGENTS.md/.mcp.json 檔(斷言不存在)。
  - registrar 失敗 → warnings 有值、init 不 throw。
- **server.ts**:斷言 `SERVER_INFO` 不變;可加測 instructions 常數非空(不必啟動 stdio)。
- **architecture.test.ts**:確認新 port/adapter 依賴方向合規。

## 8. 建議實作階段

1. **內容層(低風險、無行為耦合)**:C(digest skill 自足)+ B(MCP instructions)+ 刪 `claude-md.md`。可先做、先綠。
2. **移除 vault 人設檔 + 清理 mcp-json**:A + F 的模板/enum/bootstrap 刪除 + 測試更新。
3. **hooks 合併**:`mergeClaudeSettings`/`mergeCodexHooks` 純函式 + bootstrap 接線 + 測試。
4. **MCP 註冊**:`McpRegistrar` port + agent-cli adapter + `codex-mcp.tmpl`/`renderCodexMcpToml` + bootstrap 接線 + 注入 + 測試。
5. **預設 scope → user(E)** + init 訊息/USAGE/init-ui 文案 + dogfood `.mcp.json` 修復 + docs。
6. **端到端手動驗證**:`bun run scaffold` 觀察產物;實機 `elgt init` 於乾淨資料夾驗證 user/project 兩 scope。

## 9. 開放問題 / 後續

- **`codex mcp add` 是否支援 project scope**:官方文件未見 scope flag(預設寫 `~/.codex/config.toml`)。本設計對 Codex project scope 採「直接寫 `<vault>/.codex/config.toml`」規避不確定性。實作時若確認 `codex mcp add`(以 cwd=vault 執行)能落在專案 config,可統一改走 CLI 並移除 `codex-mcp.tmpl`。
- **Antigravity MCP**:維持文件手動提示,列為後續自動化。
- **skill 內容更新**:skip-if-exists 代表升級不會刷新既有 skill;未來可加 `--force`/版本比對。
- **`~/.claude.json` 由 CLI 代管的併發**:靠官方 `claude mcp add` 規避我方手改的 race,已是最安全路徑;無額外處理。

## 10. 受影響檔案清單(預估)

- 刪:`src/assets/claude-md.md`、`src/assets/mcp-json.tmpl`
- 新增:`src/assets/codex-mcp.tmpl`、`src/infrastructure/adapters/agent-cli.ts`、合併函式檔(如 `src/core/application/config-merge.ts`)
- 改:`src/core/application/bootstrap.ts`、`src/core/application/templates.ts`、`src/core/ports.ts`、`src/presentation/cli/elgt.ts`、`src/presentation/cli/init-ui.tsx`、`src/presentation/mcp/server.ts`、`src/assets/skill-digest.md`、`/.mcp.json`(dogfood 修復)、`CLAUDE.md`(src/assets 清單)、`docs/manual/index.html`
- 測試:`bootstrap.test.ts`、`elgt.test.ts`、`templates.test.ts`、新增合併函式與 registrar 測試
