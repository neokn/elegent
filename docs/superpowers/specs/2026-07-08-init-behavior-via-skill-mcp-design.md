# EleGent init 行為重構:vault 去 CLAUDE.md、行為改由 skill + MCP 承載、支援分層記憶(local/project scope)

- 日期:2026-07-08
- 狀態:設計已定案,待實作規劃(writing-plans)
- 相關程式:`src/core/application/bootstrap.ts`、`src/core/application/templates.ts`、`src/core/application/scaffold.ts`、`src/core/ports.ts`、`src/presentation/cli/elgt.ts`、`src/presentation/cli/init-ui.tsx`、`src/presentation/mcp/server.ts`、`src/assets/*`

## 1. 背景與問題

EleGent 的核心價值是「**我在任何地方和 agent 對話都會被記錄**」。記錄由 hooks 完成(`Stop`/`PreCompact`/`SessionEnd`/`SessionStart`),與 vault 的 `CLAUDE.md` 無關——hooks 可裝在 user scope(`~/.claude/settings.json`)全域生效。

目前 `elgt init` 有幾個與此定位相衝突的問題:

1. **vault 被塞進 agent 人設 `CLAUDE.md` + `AGENTS.md` symlink**(`bootstrap.ts` 的 `ROOT_RENDERED_FILES`、`CONTEXT_SYMLINKS`),不論 scope 都無條件寫入。`src/assets/claude-md.md` 裝的是「你是這個 vault 的圖書館員 + 格式鐵律 + 檢索 SOP」,只有 cwd=vault 時才生效,和「隨處記錄」無關。使用者的實際對話多半發生在**別的專案資料夾**,vault 不是「拿來開發的專案」,不該被強加 agent 人設。
2. **`skill-digest.md` 依賴 `CLAUDE.md`/`AGENTS.md`**:4 處寫「依 CLAUDE.md / AGENTS.md 的工具指令執行…」(19、23、31、32 行)。
3. **user scope 目前是空操作**:`bootstrap` 對每個檔「存在就跳過」(`bootstrap.ts:152`)。既有使用者早有 `~/.claude/settings.json`、`~/.codex/hooks.json` → init 直接跳過 → hooks 沒裝上 → 賣點對他們沒生效。且預設 scope 是 `project`。
4. **缺少「綁定專案的記憶」**:使用者想在某個正在做的 repo 裡,額外掛一份綁定該專案的記憶(私有或共享),並在查詢時同時查到「全域記憶 + 這個專案的記憶」。目前無此能力。

**本 repo 自己的根 `CLAUDE.md`/`AGENTS.md` 是開發用的,合理,不在本次範圍。**

## 2. 目標 / 非目標

### 目標
- `elgt init` **不再往使用者 vault 產生任何 agent 人設檔**(`CLAUDE.md`、`AGENTS.md`)。
- agent 行為改由 **skill + MCP** 承載,依 init scope 寫到對應位置。
- 讓 user scope **真的能動**:寫進既有共用設定檔時採「加值式合併」。
- 預設 scope 改為 `user`,兌現「隨處記錄」。
- 自動化 Claude/Codex 的 MCP 註冊。
- **新增 `local` scope**:在既有專案裡建立**私有、gitignored、自動命名**的嵌入式 vault。
- **project scope 改為嵌入式共享 vault**:同樣自動命名(可見、進版控)。
- **分層記憶查詢**:`user`(全域底層)之上可疊一個專案層(`local` 或 `project`),查詢時同時涵蓋兩個 vault。

### 非目標
- 不動本 repo 自己的根 `CLAUDE.md`/`AGENTS.md`(開發用)。
- 不自動化 Antigravity 的 MCP 註冊。
- 不改 vault 的格式規範/lint 規則本身。
- 不處理 skill 內容的「更新既有安裝」(skip-if-exists 沿用)。
- **不代管 `.claude`/`.codex` 的 gitignore**——那些目錄由使用者自己管理;init 只在 local scope 把 **vault 本身**加進 `.gitignore`。
- **不特別路由記錄**:記錄由 hooks 完成;分層情境下兩端 hooks 各自歸檔(對話會寫進兩個 vault),此為預期、可接受(見 §9)。

## 3. 核心心智模型

> **記錄(hooks)無條件全域;查詢與策展(MCP + skill)跟著 scope 走。記憶可分層:全域底層 + 綁定專案的嵌入層,以 basename 自動命名、由 MCP 自動探測疊加。**

- **記錄 = hooks**:預設 user scope → 到處都錄,歸檔回固定的 `ELEGENT_ROOT` vault。
- **查詢 = MCP**:`elegent-memory` server 的 `memory_list/search/read/wake`;檢索 SOP + 定位放進 server `instructions`。**server 可同時服務多個 vault root**(§4.8)。
- **策展/寫入 = digest skill**:格式鐵律、寫入契約、entity 事實表都在 skill 內,自我完備。
- **scope 一致原則**:init 選什麼 scope,三類東西(hooks/skill/MCP)就寫到那個 scope 的位置。
- **分層與對稱**:`user` 是常駐底層(全域記錄 + 全域 vault)。其上可疊**一個**綁定專案的嵌入式 vault:
  - `project` = `<專案>/{slug}.vault`(可見、進版控、團隊共享)
  - `local` = `<專案>/.{slug}.vault`(隱藏、gitignored、個人私有)
  兩者都嵌在當前專案、都以 basename 命名、都能被 MCP 自動探測。在該專案內查詢 → 涵蓋「底層 vault + 專案層 vault」。

## 4. 設計細節

### 4.1 移除 vault 人設檔(A)
- `bootstrap.ts`:`ROOT_RENDERED_FILES` 移除 `CLAUDE.md`;`CONTEXT_SYMLINKS` 清空(移除 `AGENTS.md → CLAUDE.md`)。保留 `.gitignore` 寫入。
- `templates.ts`:`TemplateName` 移除 `"claude-md"`;刪 import 與 map entry。
- 刪 `src/assets/claude-md.md`。

### 4.2 recall + 定位進 MCP instructions(B)
`src/presentation/mcp/server.ts`:
- `new McpServer(SERVER_INFO)` → `new McpServer(SERVER_INFO, { instructions: VAULT_INSTRUCTIONS })`(SDK `ServerOptions.instructions` 已確認)。
- `VAULT_INSTRUCTIONS` = server.ts 內字串常數(烤進 binary)。內容:vault 總覽(PARA + palace 雙受眾)+ 檢索 SOP + 「寫入走 /digest、index.md 是生成物別手改」+「記憶可能分層,搜尋結果以 `[vault]` 前綴標註來源」。刻意不重述完整格式鐵律。
- 磨利 4 個 tool 的 `description`。

草稿:
```
這是 EleGent 個人記憶 vault(雙受眾 markdown)。projects/areas/resources/archives = PARA(給人);palace/ = 記憶宮殿(給 LLM)。可能同時掛載多個 vault(全域 + 專案),搜尋結果會以 [vault] 前綴標註來源。

查詢「我記得…嗎」SOP:
1. 先 memory_wake 拿 identity + 當前要事;或 memory_read `palace/map.md` 定位。
2. memory_search 多路查詢:原句 + 同義詞 + 上位概念(查一次不夠)。
3. 只 memory_read 命中的檔;需要證據追到 palace/raw/ 逐字紀錄。
4. 有價值的綜合值得回填——請使用者觸發 /digest 依寫入契約寫回 PARA。

不要自己改檔:寫入一律走 /digest skill。index.md 是生成物(elgt reindex),別手改。
```

### 4.3 digest skill 自我完備(C)
`src/assets/skill-digest.md`:
- 拿掉對 `CLAUDE.md`/`AGENTS.md` 的 4 處引用,改直接寫命令:`elgt guard <path>`、`elgt reindex`、`elgt lint`。
- 從 `claude-md.md` 搬入格式鐵律:frontmatter 欄位表、`type` 封閉詞彙表、內部連結格式、entity 固定槽位、`user_managed: true` 只讀。
- 開頭「你是 vault 的圖書館員」保留。

### 4.4 scope 模型與落點(D)
`AgentConfigScope` 擴為 `"project" | "user" | "local" | "none"`。落點:

| 產物 | project | user | local |
|---|---|---|---|
| Claude hooks | `<專案>/.claude/settings.json`(合併) | `~/.claude/settings.json`(合併) | `<專案>/.claude/settings.local.json`(合併) |
| Codex hooks | `<專案>/.codex/hooks.json`(合併) | `~/.codex/hooks.json`(合併) | `<專案>/.codex/hooks.json`(合併) |
| Claude MCP | `claude mcp add --scope project`(條件註冊,§4.8) | `claude mcp add --scope user` | `claude mcp add --scope local`(條件註冊,§4.8) |
| Codex MCP | `<專案>/.codex/config.toml` 模板(條件) | `codex mcp add` | `<專案>/.codex/config.toml` 模板(條件) |
| digest skill | `<專案>/.claude|.codex/skills/digest/` | `~/.claude|.codex/skills/digest/` | `<專案>/.claude|.codex/skills/digest/` |

- `none`:該 agent 三類全不裝。
- **local/project 的 `.claude`/`.codex` 一律不進 gitignore**(使用者自管);local 只把 vault 加進 gitignore(§4.7)。
- Claude local hooks 用 `.claude/settings.local.json`(Claude 原生 git 不追蹤的個人設定檔),符合「私有」。
- Codex 無「local 個人層」,故 local 直接寫 `<專案>/.codex/*`(是否 commit 交給使用者)。

#### 4.4.1 hooks 冪等合併
- 純函式(`src/core/`,無 I/O):`mergeClaudeSettings(existing, opts)`、`mergeCodexHooks(existing, opts)`。
- 語意:`existing=null` → 全新檔;否則 parse,對每個事件陣列**確保我方 hook 條目存在**(以 command 字串去重),並確保 `permissions.allow`(Claude)含我方項。**只增不改不刪**。回 pretty JSON。parse 失敗 → 不動既有檔 + 警告(不炸 init)。
- hook command:local/user 用絕對 `ELEGENT_ROOT=<專案> ELEGENT_VAULT_NAME=<vault名>`(local 的 vault 名 = §4.7 slug 名);project 亦用絕對(vault 名 = project slug 名)。

#### 4.4.2 Codex MCP project/local 模板
- 新增 `src/assets/codex-mcp.tmpl`(TOML `[mcp_servers.elegent-memory]` + `.env.ELEGENT_VAULT`);`renderCodexMcpToml(...)` 純函式(拆 `elegentBin` 為 command + args);`TemplateName` 加 `"codex-mcp"`。Codex project/local 用模板(條件寫,§4.8);user 走 `codex mcp add`。

### 4.5 預設 scope → user(E)
- `bootstrap.ts`、`elgt.ts`(prompt defaults)、`parseInitArgs` 預設 → `"user"`。
- `init-ui.tsx`:`SCOPE_OPTIONS` 加 `local`;`defaultValue` = `user`;文案說明三種 scope。
- `USAGE` 更新可選值(加 `local`)與預設說明。

### 4.6 連帶清理(F)
- **刪** `src/assets/mcp-json.tmpl` 與 `bootstrap.ts` 的 `normalizeMcpJson`(Claude MCP 改由 `claude mcp add` 產生);`ROOT_RENDERED_FILES` 移除 `.mcp.json`;`TemplateName` 移除 `"mcp-json"`。
- `elgt.ts` init 完成訊息:移除「手動加 `~/.codex/config.toml`」段、AGENTS.md 字句;更新 MCP 掛載說明;local scope 印「已建 `.{slug}.vault` 並加入 .gitignore」與 Codex 信任提示。
- **修 dogfood 壞檔**:repo 根 `/.mcp.json` 指向已不存在的 `tools/mcp/server.ts` → 修為 `src/presentation/mcp/server.ts`。
- repo 根 `CLAUDE.md`:更新 `src/assets/` 清單(移除 `claude-md.md`、`mcp-json.tmpl`,加 `codex-mcp.tmpl`)。
- `docs/manual/index.html`:更新使用者說明。
- 測試:移除對 CLAUDE.md/AGENTS.md/`.mcp.json` 生成的斷言;新增合併函式、`McpRegistrar`、scope 路由(含 local/project)、多 vault server、vault 命名測試。

### 4.7 嵌入式 vault 命名(local 與 project)(新)

**base slug 計算**(兩 scope 共用):
- `base = slugify(basename(targetDir))`,再**剝除開頭的 `.`/`-`**(確保不以點開頭);`slugify` 沿用 `@core/domain/safety`(小寫、`-`)。
- 例:`A/` → `a`;`My App/` → `my-app`;`~/code/my-app/` → `my-app`;`.config/` → `config`(開頭點被去除)。
- 退化邊界(base 空,如檔案系統根):project vault → `vault`;local vault → `.vault`。

**命名(強制,拒絕 `--vault-name`;`--vault-name` 僅對 user scope 有效)**:
- **project**:`<targetDir>/{base}.vault`(可見)。例 `my-app.vault`。
- **local**:`<targetDir>/.{base}.vault`(隱藏)。例 `.my-app.vault`。

**gitignore**:
- **local**:把 `.{base}.vault/` 加進 `<targetDir>/.gitignore`(檔不存在則建;存在則冪等 append,已含則跳過)。**只加 vault 這一行。**
- **project**:**不** gitignore(vault 進版控、團隊共享)。

**其他**:
- vault 資料夾本身即 PARA + palace 根;`scaffoldVault` 針對此路徑產骨架。
- `git init`:沿用現有邏輯(targetDir 已是 repo → 跳過;否則 init)。不為 vault 子目錄另建 nested repo。
- 抽象:`resolveVaultDir(targetDir, scope, vaultNameOpt)` 決定 vault 目錄名(project/local → 強制 base 名;user → `vaultNameOpt ?? "vault"`)。

### 4.8 查詢分層:多 vault MCP server(丙)

**目標**:`user + local`(或 `user + project`)情境下,於專案內查詢同時涵蓋「全域 vault + 該專案的嵌入 vault」,且不受 MCP 同名 precedence(Local > Project > User,同名只有一個存活)之害。

**server.ts 服務多個 vault root**:
- root 來源 = (1) `ELEGENT_VAULT`(主 vault;向後相容) + (2) **自動探測**:在 `CLAUDE_PROJECT_DIR ?? process.cwd()` 下計算 `base=剝點的 slug(basename)`,尋找 `{base}.vault`(project)與 `.{base}.vault`(local),存在且與主 vault 不同 → 納入。
  - `CLAUDE_PROJECT_DIR` 由 Claude Code 注入 MCP server 環境(已確認);Codex 可能不設,fallback `process.cwd()`(§9)。
- root 以 `realpath` 去重。
- `listDir`/`searchVault`/`readNote`/`buildWakeBundle` 跨 root 運作,結果以 `[vault標籤] …` 前綴標註(標籤 = vault 目錄 basename)。`memory_read` path 可接受 `標籤:相對路徑`,或依序在各 root 嘗試(仍逐 root 做 `resolveInVault` 逃逸檢查)。

**條件註冊(避開 precedence 陷阱;local 與 project 統一規則)**:
- **user**:`claude mcp add --scope user`,`ELEGENT_VAULT=<全域vault>`。此 server 在**所有目錄**載入;進到含嵌入 vault 的專案時,自動探測把該層疊上 → **user+local / user+project 查兩處達成,且 local/project 不需另註冊 MCP**。
- **local / project**:**僅當不存在 user-scope 的 `elegent-memory` 時**才註冊自己的 MCP(local → `--scope local`、`ELEGENT_VAULT=<.base.vault>`;project → `--scope project`(cwd=targetDir,`.mcp.json` 落 `<targetDir>/.mcp.json`)、`ELEGENT_VAULT=<base.vault>`);Codex 同理寫 `.codex/config.toml`。**否則跳過**——由到處載入的 user server + 自動探測負責查詢。理由:若 user 已存在而 local/project 又註冊同名 server,在該專案會**蓋掉** user server、丟失全域層。
- `McpRegistrar` 需具「查詢 user-scope 是否已註冊」能力。

**權衡**:`user + project` 時因跳過 project 註冊,不會產生 committed `.mcp.json`(團隊他人 clone 後無法查該 project vault)——本工具以個人記憶為主,此共享情境列為已知限制(§9);`project` 單獨(無 user)時才寫 committed `.mcp.json`,團隊共享成立。

#### 4.8.1 Codex 端
Codex 無 `CLAUDE_PROJECT_DIR`,自動探測用 server 的 `process.cwd()`(通常=專案目錄)。可行度列 §9;至少保證主 vault 可查。

### 4.9 混用規則與驗證
- 合法:`user` / `project` / `local` / `none`(單獨);疊加 `user + local`、`user + project`。
- **禁止 `local + project` 混用**:一個專案只選一種專案層可見度模型(私有 vs 共享)。
- 因 `claudeScope`/`codexScope` 各自獨立,驗證落在「vault 放置」單一決策:
  - 任一 scope = `local` → 另一只能 `local`/`none`(給 `project`/`user` → usage error)。
  - 任一 scope = `project` → 另一只能 `project`/`user`/`none`(不可 `local`)。
- 驗證放 `parseInitArgs`/`bootstrap` 入口,違規回非零 exit + 清楚訊息。

## 5. 新抽象一覽

| 抽象 | 位置 | 職責 |
|---|---|---|
| `McpRegistrar`(port) | `src/core/ports.ts` | 用官方 CLI 註冊 MCP;含「user-scope 是否已註冊」查詢 |
| agent-cli adapter | `src/infrastructure/adapters/agent-cli.ts` | `Bun.spawn` 實作 `McpRegistrar`(claude/codex) |
| `mergeClaudeSettings` / `mergeCodexHooks` | `src/core/`(純函式) | 冪等加值式 JSON 合併 hooks + permissions |
| `renderCodexMcpToml` + `codex-mcp.tmpl` | `templates.ts` + `src/assets/` | Codex project/local config.toml 片段 |
| `resolveVaultDir` + base slug | `src/core/`(純函式) | 依 scope 決定 vault 目錄名(local/project=剝點 slug 強制名) |
| 多 root vault 解析 | `server.ts` | 主 `ELEGENT_VAULT` + 自動探測 `{base}.vault`/`.{base}.vault`;跨 root 查詢 + 來源標籤 |
| `VAULT_INSTRUCTIONS` | `server.ts` | MCP server instructions |

## 6. 邊界情況與失敗處理
- `claude`/`codex` CLI 不存在 → MCP 註冊失敗 → `warnings`,init 不中斷;訊息附手動指令。
- MCP server 已註冊 → 視為成功(`alreadyExists`),不重複。
- 既有 settings/hooks parse 失敗 → merge 回退「不動 + 警告」,不炸 init。
- 冪等:同 targetDir 重跑,`created` 穩定、既有內容不變、MCP 不重複、gitignore 不重複 append。
- `elegentBin` 兩段式(dev `bun /abs/elgt.ts`)→ MCP CLI `--` 後與 TOML args 正確拆段。
- Codex project/local 信任警語:`.codex/*` 需在 Codex 內 `/hooks` 信任後才載入 → init 訊息保留提示。
- local scope 的 targetDir 非 git repo → 仍建 `.gitignore`(含 vault 行);`git init` 依現有邏輯。
- 自動探測:同一 vault 既是主 root 又被探測到 → realpath 去重。
- base slug 退化(空)→ project `vault` / local `.vault`。

## 7. 測試策略
- **純函式**:`mergeClaudeSettings`/`mergeCodexHooks`(空、既有含他人 hook、重跑去重、壞 JSON 回退)、`renderCodexMcpToml`、`resolveVaultDir` + base slug(各 scope、slugify、剝開頭點、退化 `vault`/`.vault`)。
- **bootstrap**(注入 in-memory `FileStore` + fake `GitRunner` + fake `McpRegistrar`):
  - project:建 `<base>.vault`(可見);`.gitignore` **不含** vault;settings/hooks/skill + Codex toml(在無 user 時);registrar 在「無 user」時 `--scope project`、「有 user」時**跳過**。
  - user:合併進 fake `~/.claude/settings.json`;registrar `--scope user`;不產專案內 hook。
  - local:建 `.<base>.vault`;`.gitignore` 含該行且**不含** `.claude`/`.codex`;Claude hooks 進 `settings.local.json`;registrar 在「無 user」時 `--scope local`、「有 user」時**跳過**。
  - 不再產 CLAUDE.md/AGENTS.md/.mcp.json 檔(斷言不存在)。
  - 混用驗證:`local+project` → 非零 exit;`local+user`、`user+project` → 通過。
  - registrar 失敗 → warnings 有值、init 不 throw。
- **server.ts**:`SERVER_INFO` 不變;instructions 非空;多 root——注入含 `.<base>.vault`/`<base>.vault` 的暫存專案 + 設 `CLAUDE_PROJECT_DIR` → `searchVault` 跨 root、結果帶標籤、realpath 去重;`resolveInVault` 逃逸仍擋。
- **architecture.test.ts**:新 port 在 core、adapter 在 infra、server 屬 presentation,依賴方向合規。

## 8. 建議實作階段
1. **內容層**:C(digest 自足)+ B(MCP instructions)+ 刪 `claude-md.md`。
2. **移除人設檔 + 清 mcp-json**:A + F 的模板/enum/bootstrap 刪除 + 測試更新。
3. **hooks 合併**:`mergeClaudeSettings`/`mergeCodexHooks` + bootstrap 接線 + 測試。
4. **MCP 註冊**:`McpRegistrar` port(含 user-exists 查詢)+ agent-cli adapter + `codex-mcp.tmpl`/`renderCodexMcpToml` + bootstrap 條件註冊接線 + 測試。
5. **預設 scope → user(E)** + init 訊息/USAGE/init-ui + dogfood `.mcp.json` 修復 + docs。
6. **嵌入式 vault(local + project)**:`resolveVaultDir` + base slug(剝點)+ 強制命名 + local gitignore vault + settings.local.json 路由 + 混用驗證(§4.9) + 測試。
7. **多 vault server(丙)**:server.ts 多 root + 自動探測兩 pattern + 來源標籤 + 條件註冊整合 + 測試。
8. **端到端手動驗證**:`bun run scaffold`;實機 `elgt init` 驗 user / project / local 三 scope 與 user+local、user+project 查兩處。

## 9. 開放問題 / 後續
- **`codex mcp add` 是否支援 project/local scope**:官方文件未見 scope flag(預設寫 `~/.codex/config.toml`)。故 Codex project/local 採「直接寫 `.codex/config.toml`」。若確認 CLI 能落專案 config,可統一並移除模板。
- **Codex 的自動探測基準**:Codex 是否對 MCP server 設等同 `CLAUDE_PROJECT_DIR` 的變數未知;暫用 `process.cwd()` fallback,實作時驗證,必要時 Codex 端僅支援主 vault。
- **記錄到兩端**:分層時 hooks 兩端各自歸檔(對話同時寫進全域 + 專案 vault),為預期行為、使用者已接受;依賴各 CLI 對多來源 hooks 採 additive 合併(實作時驗證)。
- **user+project 團隊共享**:見 §4.8「權衡」——user+project 不寫 committed `.mcp.json`,列為已知限制。
- **Antigravity MCP**:維持手動提示。
- **skill 內容更新**:skip-if-exists → 升級不刷新;未來加 `--force`/版本比對。
- **`~/.claude.json` 併發**:靠官方 `claude mcp add` 規避 race。

## 10. 受影響檔案清單(預估)
- 刪:`src/assets/claude-md.md`、`src/assets/mcp-json.tmpl`
- 新增:`src/assets/codex-mcp.tmpl`、`src/infrastructure/adapters/agent-cli.ts`、合併函式檔(如 `src/core/application/config-merge.ts`)、`resolveVaultDir` + base slug(可併入 scaffold 或新模組)
- 改:`src/core/application/bootstrap.ts`、`src/core/application/templates.ts`、`src/core/application/scaffold.ts`、`src/core/ports.ts`、`src/presentation/cli/elgt.ts`、`src/presentation/cli/init-ui.tsx`、`src/presentation/mcp/server.ts`、`src/assets/skill-digest.md`、`/.mcp.json`(dogfood 修復)、`CLAUDE.md`(src/assets 清單)、`docs/manual/index.html`
- 測試:`bootstrap.test.ts`、`elgt.test.ts`、`templates.test.ts`、`server.test.ts`、新增合併/registrar/resolveVaultDir 測試
