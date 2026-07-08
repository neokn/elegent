# EleGent init 行為重構:vault 去 CLAUDE.md、行為改由 skill + MCP 承載、支援分層記憶(local scope)

- 日期:2026-07-08
- 狀態:設計已定案,待實作規劃(writing-plans)
- 相關程式:`src/core/application/bootstrap.ts`、`src/core/application/templates.ts`、`src/core/ports.ts`、`src/presentation/cli/elgt.ts`、`src/presentation/cli/init-ui.tsx`、`src/presentation/mcp/server.ts`、`src/assets/*`

## 1. 背景與問題

EleGent 的核心價值是「**我在任何地方和 agent 對話都會被記錄**」。記錄本身由 hooks 完成(`Stop`/`PreCompact`/`SessionEnd`/`SessionStart`),與 vault 的 `CLAUDE.md` 完全無關——hooks 可裝在 user scope(`~/.claude/settings.json`)全域生效。

目前 `elgt init` 有幾個與此定位相衝突的問題:

1. **vault 被塞進 agent 人設 `CLAUDE.md` + `AGENTS.md` symlink**(`bootstrap.ts` 的 `ROOT_RENDERED_FILES`、`CONTEXT_SYMLINKS`),不論 scope 都無條件寫入。`src/assets/claude-md.md` 裝的是「你是這個 vault 的圖書館員 + 格式鐵律 + 檢索 SOP」,只有 cwd=vault 時才生效,和「隨處記錄」無關。使用者的實際對話多半發生在**別的專案資料夾**,vault 不是「拿來開發的專案」,不該被強加 agent 人設。
2. **`skill-digest.md` 依賴 `CLAUDE.md`/`AGENTS.md`**:有 4 處寫「依 CLAUDE.md / AGENTS.md 的工具指令執行…」(第 19、23、31、32 行)。
3. **user scope 目前是空操作**:`bootstrap` 對每個檔「存在就跳過」(`bootstrap.ts:152`)。既有使用者早有 `~/.claude/settings.json`、`~/.codex/hooks.json` → init 直接跳過 → hooks 沒裝上 → 賣點對他們沒生效。且預設 scope 是 `project`(`bootstrap.ts:137`)。
4. **缺少「綁定專案的私有記憶」**:使用者可能想在某個正在做的 repo 裡,額外掛一份**只屬於這個專案、不進版控**的記憶,並在查詢時同時查到「全域記憶 + 這個專案的私有記憶」。目前無此能力。

**本 repo 自己的根 `CLAUDE.md`/`AGENTS.md` 是開發用的,合理,不在本次範圍**——它們是「開發 elgt 這個工具」的指示,與 init 產物是兩種不同的東西。

## 2. 目標 / 非目標

### 目標
- `elgt init` **不再往使用者 vault 產生任何 agent 人設檔**(`CLAUDE.md`、`AGENTS.md`)。
- agent 行為改由 **skill + MCP** 承載,依 init 選的 scope 寫到對應位置。
- 讓 user scope **真的能動**:寫進既有共用設定檔時採「加值式合併」,不覆寫、不跳過。
- 預設 scope 改為 `user`,兌現「隨處記錄」。
- 自動化 Claude/Codex 的 MCP 註冊(取代目前叫使用者手動加設定的步驟)。
- **新增 `local` scope**:在既有專案裡建立**私有、gitignored、自動命名**的嵌入式 vault。
- **分層記憶查詢**:`user`(全域底層)之上可疊一個專案層(`local` 或 `project`),查詢時**同時涵蓋兩個 vault**。

### 非目標
- 不動本 repo 自己的根 `CLAUDE.md`/`AGENTS.md`(開發用)。
- 不自動化 Antigravity 的 MCP 註冊——維持文件提示,列為後續。
- 不改 vault 的格式規範/lint 規則本身。
- 不處理 skill 內容的「更新既有安裝」問題(skip-if-exists 沿用現況)。
- **`local` scope 不代管 `.claude`/`.codex` 的 gitignore**——那些目錄由使用者自己管理,init 只把 **vault 本身**加進 `.gitignore`。
- **記錄(hooks)在多層情境下的路由細節**(例:user+local 時對話該記到哪個 vault)本次不最佳化;各 scope 的 hooks 各自歸檔到自己的 vault,細節列為開放問題。本次只把**查詢分層**做對。

## 3. 核心心智模型

> **記錄(hooks)無條件全域;查詢與策展(MCP + skill)跟著 scope 走。記憶可分層:全域底層 + 綁定專案的疊加層。**

- **記錄 = hooks**:預設 user scope → 到處都錄,歸檔回固定的 `ELEGENT_ROOT` vault。
- **查詢 = MCP**:`elegent-memory` server 的 `memory_list/search/read/wake` 是檢索實作;檢索 SOP 與 vault 定位放進 MCP server `instructions`(cwd=vault 時無條件在場)。**server 可同時服務多個 vault root**(見 §4.8)。
- **策展/寫入 = digest skill**:格式鐵律、寫入契約、entity 事實表都在 skill 內,自我完備。
- **scope 一致原則**:init 選什麼 scope,三類東西(hooks/skill/MCP)就寫到那個 scope 的位置。
- **分層**:`user` 是常駐底層(全域記錄 + 全域 vault);其上可疊**一個**綁定專案的層——`local`(嵌入該專案、私有)或 `project`(獨立 vault repo)。在該專案內查詢時,涵蓋「底層 vault + 專案層 vault」兩處。

## 4. 設計細節

### 4.1 移除 vault 人設檔(A)

- `bootstrap.ts`:`ROOT_RENDERED_FILES` 移除 `CLAUDE.md`;`CONTEXT_SYMLINKS` 清空(移除 `AGENTS.md → CLAUDE.md`,連帶清掉 symlink 迴圈若無他用)。保留 `.gitignore` 寫入。
- `templates.ts`:`TemplateName` 移除 `"claude-md"`;刪 import 與 map entry。
- 刪 `src/assets/claude-md.md`。

### 4.2 recall + 定位進 MCP instructions(B)

`src/presentation/mcp/server.ts`:
- `new McpServer(SERVER_INFO)` → `new McpServer(SERVER_INFO, { instructions: VAULT_INSTRUCTIONS })`(SDK `ServerOptions.instructions` 已確認支援)。
- `VAULT_INSTRUCTIONS` 為 server.ts 內字串常數(烤進 binary,不寫進使用者資料夾)。內容:vault 總覽(PARA + palace 雙受眾)+ 檢索 SOP(以 `memory_wake`/`memory_read palace/map.md`/`memory_search` 多路查詢/追 `palace/raw/` 表述)+「寫入一律走 /digest、index.md 是生成物別手改」+ **「記憶可能分層,搜尋結果會標註來自哪個 vault」**。刻意不重述完整格式鐵律(留給 digest skill + lint)。
- 磨利 4 個 tool 的 `description`。

草稿(實作可微調):
```
這是 EleGent 個人記憶 vault(雙受眾 markdown)。projects/areas/resources/archives = PARA(給人);palace/ = 記憶宮殿(給 LLM)。可能同時掛載多個 vault(全域 + 專案私有),搜尋結果會以 [vault] 前綴標註來源。

查詢「我記得…嗎」SOP:
1. 先 memory_wake 拿 identity + 當前要事;或 memory_read `palace/map.md` 定位。
2. memory_search 多路查詢:原句 + 同義詞 + 上位概念(查一次不夠)。
3. 只 memory_read 命中的檔;需要證據追到 palace/raw/ 逐字紀錄。
4. 有價值的綜合值得回填——請使用者觸發 /digest 依寫入契約寫回 PARA。

不要自己改檔:寫入一律走 /digest skill(格式鐵律、entity 事實表、append-only raw 都在那)。index.md 是生成物(elgt reindex),別手改。
```

### 4.3 digest skill 自我完備(C)

`src/assets/skill-digest.md`:
- 拿掉對 `CLAUDE.md`/`AGENTS.md` 的 4 處引用(19、23、31、32 行),改直接寫命令:`elgt guard <path>`、`elgt reindex`、`elgt lint`。
- 從 `claude-md.md` 搬入格式鐵律:frontmatter 欄位表、`type` 封閉詞彙表、內部連結格式、entity 固定槽位(`## Facts`/`## Links`/`## Citations`)、`user_managed: true` 只讀。
- 開頭「你是 vault 的圖書館員」保留,兼作定位。

### 4.4 scope 模型與落點(D)

`AgentConfigScope` 擴為 `"project" | "user" | "local" | "none"`。落點:

| 產物 | project | user | local |
|---|---|---|---|
| Claude hooks | `<vault根>/.claude/settings.json`(合併) | `~/.claude/settings.json`(合併) | `<cwd>/.claude/settings.local.json`(合併) |
| Codex hooks | `<vault根>/.codex/hooks.json`(合併) | `~/.codex/hooks.json`(合併) | `<cwd>/.codex/hooks.json`(合併) |
| Claude MCP | `claude mcp add --scope project`(cwd=vault根) | `claude mcp add --scope user` | `claude mcp add --scope local`(見 §4.8 條件註冊) |
| Codex MCP | `<vault根>/.codex/config.toml` 模板 | `codex mcp add` | `<cwd>/.codex/config.toml` 模板 |
| digest skill | `<vault根>/.claude|.codex/skills/digest/` | `~/.claude|.codex/skills/digest/` | `<cwd>/.claude|.codex/skills/digest/` |

- `none`:該 agent 三類全不裝(語意不變)。
- **local 的 `.claude`/`.codex` 一律不進 gitignore**(使用者自己管理);init 只把 vault 加進 gitignore(§4.7)。
- Claude local hooks 用 `.claude/settings.local.json`(Claude 原生的 git 不追蹤個人設定檔),天生符合「私有」。
- Codex 無「local 個人設定層」,故 local 直接寫 `<cwd>/.codex/*`(是否 commit 交給使用者)。

#### 4.4.1 hooks 冪等合併
- 純函式(放 `src/core/`,無 I/O):`mergeClaudeSettings(existing, opts)`、`mergeCodexHooks(existing, opts)`。
- 語意:`existing=null` → 全新檔;否則 parse,對每個事件陣列**確保我方 hook 條目存在**(以 command 字串去重),並確保 `permissions.allow`(Claude)含我方項。**只增不改不刪**。回 pretty JSON。parse 失敗 → 不動既有檔、發警告(不炸掉 init)。
- local scope 的 Claude hooks 目標檔改為 `settings.local.json`(其餘同 user/project)。
- hook command:local/user 用絕對 `ELEGENT_ROOT=<cwd> ELEGENT_VAULT_NAME=<vault名>`(local 的 vault 名 = §4.7 的 slug 名);project 沿用相對 `{{ELEGENT_BIN}}`。

#### 4.4.2 Codex MCP project/local 模板
- 新增 `src/assets/codex-mcp.tmpl`(TOML `[mcp_servers.elegent-memory]` + `.env.ELEGENT_VAULT`);`renderCodexMcpToml(...)` 純函式產出(把 `elegentBin` 拆 command + args,類似 `normalizeMcpJson`);`TemplateName` 加 `"codex-mcp"`。
- Codex **project/local** 用模板;**user** 走 `codex mcp add`。

### 4.5 預設 scope → user(E)

- `bootstrap.ts:137-141`、`elgt.ts:209-210`(prompt defaults)、`parseInitArgs` 預設 → `"user"`。
- `init-ui.tsx`:`SCOPE_OPTIONS` 加 `local`;`defaultValue` 對齊 `user`;文案說明三種 scope 差異。
- `USAGE`(`elgt.ts:22`)更新可選值(加 `local`)與預設值說明。

### 4.6 連帶清理(F)

- **刪** `src/assets/mcp-json.tmpl` 與 `bootstrap.ts` 的 `normalizeMcpJson`(Claude `.mcp.json` 改由 `claude mcp add --scope project` 產生);`ROOT_RENDERED_FILES` 移除 `.mcp.json`;`TemplateName` 移除 `"mcp-json"`。
- `elgt.ts` init 完成訊息(約 149-159 行):移除「手動加 `~/.codex/config.toml`」段(已自動化)、AGENTS.md 字句;更新 MCP 掛載說明;針對 local scope 印出「已建立 `.{slug}.vault` 並加入 .gitignore」與 Codex 信任提示。
- **修 dogfood 壞檔**:repo 根 `/.mcp.json` 指向已不存在的 `tools/mcp/server.ts` → 修為 `src/presentation/mcp/server.ts`。
- repo 根 `CLAUDE.md`:更新 `src/assets/` 清單(移除 `claude-md.md`、`mcp-json.tmpl`,加 `codex-mcp.tmpl`)。
- `docs/manual/index.html`:更新使用者說明(init 不再產 CLAUDE.md;MCP 自動註冊;local scope 用法)。
- 測試:移除對 CLAUDE.md/AGENTS.md/`.mcp.json` 生成的斷言;新增合併函式、`McpRegistrar`、scope 路由(含 local)、多 vault server、vault 命名的測試。

### 4.7 local scope 的 vault(新)

- **名稱**:強制 = `.` + `slugify(basename(targetDir))` + `.vault`。`slugify` 沿用 `@core/domain/safety`(小寫、`-`)。
  - `A/` → `.a.vault`;`My App/` → `.my-app.vault`;`~/code/my-app/` → `.my-app.vault`。
  - **拒絕 `--vault-name`**(local 不可自訂;若同時給 `--vault-name` + local → usage error 或忽略並警告)。
  - 極端邊界(basename 空/slugify 後為空,例如檔案系統根)→ 退回 `.vault`。
- **位置**:`<targetDir>/<強制名>/`;這個資料夾本身即 PARA + palace 根(不是 `targetDir/vault` 子層)。scaffoldVault 針對此路徑產骨架。
- **gitignore**:把 `<強制名>/` 這一行加進 `<targetDir>/.gitignore`(檔不存在則建,存在則冪等 append——已含該行則跳過)。**只加 vault 這一行**。
- **不 `git init`**:local 的 targetDir 通常是既有 repo。沿用現有邏輯(`.git` 存在 → 跳過);vault 子目錄不另建 nested repo(由父 repo 的 gitignore 排除即可;digest skill 遇「vault 未被 git 追蹤」本就會略過 commit)。
- **vault 位置抽象**:目前 `vault = join(targetDir, vaultName)`。改為由一個 `resolveVaultDir(targetDir, scope, vaultNameOpt)` 決定:local → 強制 slug 名;其餘 → `vaultName ?? "vault"`。

### 4.8 查詢分層:多 vault MCP server(丙)

**目標**:在 `user + local` 情境下,於專案內查詢能同時涵蓋「全域 vault + 該專案的 `.{slug}.vault`」,且不受 MCP 同名 precedence(Local > Project > User,同名只有一個存活)之害。

**server.ts 改為服務多個 vault root**:
- root 來源 = (1) `ELEGENT_VAULT`(其主 vault;維持向後相容,亦可為 `:`-分隔清單以支援 §4.8.2)+ (2) **自動探測**:在 `CLAUDE_PROJECT_DIR ?? process.cwd()` 下尋找 `.` + `slugify(basename(該目錄))` + `.vault`,存在且與主 vault 不同 → 加入。
  - `CLAUDE_PROJECT_DIR` 由 Claude Code 注入 MCP server 環境(已確認);Codex 可能不設,故 fallback `process.cwd()`(Codex 行為列開放問題)。
- root 以 `realpath` 去重。
- `listDir`/`searchVault`/`readNote`/`buildWakeBundle` 改為**跨 root 運作**,結果以 `[vault標籤] …` 前綴標註來源(標籤 = vault 目錄 basename)。`memory_read` 的 path 可接受 `標籤:相對路徑`,或依序在各 root 嘗試解析(仍逐 root 做 `resolveInVault` 逃逸檢查)。
- `memory_wake`:多 vault 時可回傳各 vault 的 wake bundle(或僅主 vault + 註記存在其他層),實作時定。

**註冊邏輯(關鍵,避開 precedence 陷阱)**:
- **user**:`claude mcp add --scope user`,`ELEGENT_VAULT=<全域vault>`。此 server 在**所有目錄**載入;進到含 `.{slug}.vault` 的專案時,自動探測把該層疊上 → **user+local 查兩處達成,且 local scope 不需另註冊 MCP**。
- **local**:**僅當不存在 user-scope 的 `elegent-memory` 時**才註冊 `claude mcp add --scope local`(`ELEGENT_VAULT=<.slug.vault 絕對路徑>`);否則跳過(讓 user server + 自動探測負責查詢)。理由:若 user 已存在而 local 又註冊同名 `--scope local`,在該專案會**蓋掉** user server、丟失全域層。`McpRegistrar` 需具備「查詢 user-scope 是否已註冊」能力。
- **project**:`claude mcp add --scope project`(cwd=vault根),`ELEGENT_VAULT=<project vault>`。

#### 4.8.1 Codex 端
Codex 無 `CLAUDE_PROJECT_DIR`,自動探測改用 server 的 `process.cwd()`(通常 = 專案目錄)。可行度與行為列開放問題(§9);Codex 端至少保證「主 vault 可查」。

#### 4.8.2 user + project 的兩處查詢(次要增強,可後續)
`project` vault 是獨立 repo,非嵌入的 `.slug.vault`,自動探測抓不到。要在 project vault 目錄內同時查全域,需讓該處生效的 server 知道全域 root:令 `ELEGENT_VAULT` 支援 `:`-分隔清單,project 註冊時若偵測到 user-scope 已存在則帶上全域路徑(`<全域>:<project vault>`)。此增強**列為獨立階段**,不阻擋主線(user+local)。

### 4.9 混用規則與驗證

- 合法:`user`(單獨)、`project`(單獨)、`local`(單獨)、`none`;疊加 `user + local`、`user + project`。
- **禁止 `local + project` 混用**(兩者對「專案層 vault 住哪」主張矛盾)。
- 因 `claudeScope`/`codexScope` 各自獨立,驗證落在「vault 放置」單一決策上:
  - 若任一 agent scope = `local` → vault 放置 = 嵌入式(§4.7);此時另一 agent scope 只能是 `local` 或 `none`(給 `project`/`user` → usage error)。
  - 若任一 agent scope = `project` → 另一只能是 `project`/`user`/`none`(不可 `local`)。
- 驗證放 `parseInitArgs`/`bootstrap` 入口,違規回非零 exit + 清楚訊息。

## 5. 新抽象一覽

| 抽象 | 位置 | 職責 |
|---|---|---|
| `McpRegistrar`(port) | `src/core/ports.ts` | 用官方 CLI 註冊 MCP;含「user-scope 是否已註冊」查詢 |
| agent-cli adapter | `src/infrastructure/adapters/agent-cli.ts` | `Bun.spawn` 實作 `McpRegistrar`(claude/codex) |
| `mergeClaudeSettings` / `mergeCodexHooks` | `src/core/`(純函式) | 冪等加值式 JSON 合併 hooks + permissions |
| `renderCodexMcpToml` + `codex-mcp.tmpl` | `templates.ts` + `src/assets/` | Codex project/local 的 config.toml 片段 |
| `resolveVaultDir` | `src/core/`(純函式) | 依 scope 決定 vault 目錄名(local=slug 強制名) |
| 多 root vault 解析 | `src/presentation/mcp/server.ts` | 主 `ELEGENT_VAULT` + 自動探測嵌入 `.slug.vault`;跨 root 查詢 + 來源標籤 |
| `VAULT_INSTRUCTIONS` | `server.ts` | MCP server instructions(定位 + 檢索 SOP + 分層說明) |

## 6. 邊界情況與失敗處理

- `claude`/`codex` CLI 不存在 → MCP 註冊失敗 → `warnings`,init 不中斷;訊息附手動指令。
- MCP server 已註冊 → 視為成功(`alreadyExists`),不重複。
- 既有 settings/hooks 檔 parse 失敗 → merge 回退「不動 + 警告」,不炸 init。
- 冪等:同 targetDir 重跑,`created` 穩定、既有內容不變、MCP 不重複、gitignore 不重複 append。
- `elegentBin` 兩段式(dev `bun /abs/elgt.ts`)→ MCP CLI `--` 後與 TOML args 正確拆段。
- Codex project/local 信任警語:`.codex/*` 需在 Codex 內 `/hooks` 信任後才載入 → init 訊息保留提示。
- local scope 的 targetDir 非 git repo → 仍建 `.gitignore`(含 vault 行),`git init` 依現有邏輯(可能觸發或跳過),不特別處理。
- local 自動探測:同一 vault 既是主 root 又被探測到 → realpath 去重,不重複。

## 7. 測試策略

- **純函式**:`mergeClaudeSettings`/`mergeCodexHooks`(空輸入、既有含他人 hook、重跑去重、壞 JSON 回退)、`renderCodexMcpToml`、`resolveVaultDir`(各 scope + slugify + 極端退回 `.vault`)、slug 命名。
- **bootstrap**(注入 in-memory `FileStore` + fake `GitRunner` + fake `McpRegistrar`):
  - project:vault 內產 settings/hooks/skill + Codex toml;registrar 收到 `--scope project`。
  - user:合併進 fake `~/.claude/settings.json`;registrar `--scope user`;不產 vault 內 hook。
  - local:建 `.<slug>.vault`;`.gitignore` 含該行且**不含** `.claude`/`.codex`;Claude hooks 進 `settings.local.json`;registrar 在「無 user」時 `--scope local`、「有 user」時**跳過**。
  - 不再產 CLAUDE.md/AGENTS.md/.mcp.json 檔(斷言不存在)。
  - 混用驗證:`local+project` → 非零 exit;`local+user`、`user+project` → 通過。
  - registrar 失敗 → warnings 有值、init 不 throw。
- **server.ts**:`SERVER_INFO` 不變;instructions 非空;多 root——注入兩個暫存 vault dir + 設 `CLAUDE_PROJECT_DIR` → `searchVault` 跨 root、結果帶標籤、realpath 去重;`resolveInVault` 逃逸仍擋。
- **architecture.test.ts**:新 port 在 core、adapter 在 infra、server 屬 presentation,依賴方向合規。

## 8. 建議實作階段

1. **內容層**(低風險):C(digest 自足)+ B(MCP instructions)+ 刪 `claude-md.md`。
2. **移除人設檔 + 清 mcp-json**:A + F 的模板/enum/bootstrap 刪除 + 測試更新。
3. **hooks 合併**:`mergeClaudeSettings`/`mergeCodexHooks` + bootstrap 接線 + 測試。
4. **MCP 註冊**:`McpRegistrar` port(含 user-exists 查詢)+ agent-cli adapter + `codex-mcp.tmpl`/`renderCodexMcpToml` + bootstrap 接線 + 測試。
5. **預設 scope → user(E)** + init 訊息/USAGE/init-ui + dogfood `.mcp.json` 修復 + docs。
6. **local scope**:`resolveVaultDir` + 強制 slug 命名 + gitignore vault + settings.local.json 路由 + 混用驗證(§4.9) + 測試。
7. **多 vault server(丙)**:server.ts 多 root + 自動探測 + 來源標籤 + local 條件註冊 + 測試。
8. **(次要)user+project 兩處查詢**:`ELEGENT_VAULT` 清單 + project 註冊帶全域路徑(§4.8.2)。
9. **端到端手動驗證**:`bun run scaffold`;實機 `elgt init` 驗 user / project / local 三 scope 與 user+local 查兩處。

## 9. 開放問題 / 後續

- **`codex mcp add` 是否支援 project/local scope**:官方文件未見 scope flag(預設寫 `~/.codex/config.toml`)。故 Codex project/local 採「直接寫 `.codex/config.toml`」。若確認 CLI 能落專案 config,可統一並移除模板。
- **Codex 的自動探測基準**:Codex 是否對 MCP server 設等同 `CLAUDE_PROJECT_DIR` 的變數未知;暫用 `process.cwd()` fallback,實作時驗證,必要時 Codex 端僅支援主 vault。
- **多層記錄路由**:`user+local` 時對話該記到哪個 vault(全域 / 專案 / 兩者)未定;本次不處理,列為後續旋鈕。
- **user+project 兩處查詢**:§4.8.2 的增強,列為獨立階段。
- **Antigravity MCP**:維持手動提示。
- **skill 內容更新**:skip-if-exists → 升級不刷新;未來加 `--force`/版本比對。
- **`~/.claude.json` 併發**:靠官方 `claude mcp add` 規避我方手改的 race。

## 10. 受影響檔案清單(預估)

- 刪:`src/assets/claude-md.md`、`src/assets/mcp-json.tmpl`
- 新增:`src/assets/codex-mcp.tmpl`、`src/infrastructure/adapters/agent-cli.ts`、合併函式檔(如 `src/core/application/config-merge.ts`)、`resolveVaultDir`(可併入 bootstrap 或 scaffold 模組)
- 改:`src/core/application/bootstrap.ts`、`src/core/application/templates.ts`、`src/core/application/scaffold.ts`(local vault 路徑)、`src/core/ports.ts`、`src/presentation/cli/elgt.ts`、`src/presentation/cli/init-ui.tsx`、`src/presentation/mcp/server.ts`、`src/assets/skill-digest.md`、`/.mcp.json`(dogfood 修復)、`CLAUDE.md`(src/assets 清單)、`docs/manual/index.html`
- 測試:`bootstrap.test.ts`、`elgt.test.ts`、`templates.test.ts`、`server.test.ts`、新增合併/registrar/resolveVaultDir 測試
