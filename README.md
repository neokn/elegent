# EleGent

**Elephant + Agent** —— 一頭記性最好的大象館員，替你看守一座專為「你」和「你的 AI 助理」打造的圖書館。

EleGent 是一套個人記憶系統：一顆單一執行檔 `elgt`，能在任何資料夾裡一鍵長出一座**雙受眾的 markdown vault**——

- **PARA**（`vault/projects|areas|resources|archives`）：給人看的閱覽室，整理好的專案、責任、知識主題、封存material。
- **記憶宮殿**（`vault/palace/`）：給 LLM 用的書庫，讓 Claude Code（以及其他支援 MCP 的工具）跨對話記得事情——常駐喚醒的身分/現況摘要、壓縮索引、實體事實表，以及一份逐字不改的對話存證。

一般的 AI 每開一次新對話都「從零開始」；EleGent 換個做法：把每次對話學到的東西寫進一份持久的 wiki，逐字存證與蒸餾整理分兩層各司其職，知識越用越多、越用越懂你——像存款一樣複利累積，而不是每次重新翻資料。

> 想看更完整的圖文手冊，見 [`docs/manual/index.html`](docs/manual/index.html)（繁中，用瀏覽器打開）。

---

## 目錄

- [安裝](#安裝)
- [快速開始](#快速開始)
- [CLI 指令](#cli-指令)
- [日常使用](#日常使用)
- [接上其他 AI 工具（MCP）](#接上其他-ai-工具mcp)
- [Vault 怎麼組織](#vault-怎麼組織)
- [格式鐵律](#格式鐵律)
- [多座記憶](#多座記憶)
- [開發](#開發)
- [授權](#授權)

---

## 安裝

這個 repo 已設定 git remote（`github.com/neokn/elegent`），也已經跑過 `.github/workflows/release.yml`（推 `v*` tag 觸發）發布過 GitHub Release（例如 `v0.3.0`，附 `elgt-darwin-arm64` 與 `install.sh` 兩個 asset），下面的一行安裝腳本／手動下載 Release 都可直接使用。**目前建置矩陣只鎖定 macOS Apple Silicon（`bun-darwin-arm64`）**——其他平台（Intel Mac、Linux、Windows）請用「從原始碼建置」或「開發模式」。

### 一行安裝腳本

```sh
curl -fsSL https://raw.githubusercontent.com/neokn/elegent/main/install.sh | bash
```

會從 GitHub Release 下載 `elgt-darwin-arm64`，裝到 `~/.local/bin/elgt`、`chmod +x`，並自動移除 macOS 下載檔會被加上的 quarantine 標記；`~/.local/bin` 不在 `PATH` 裡的話會提醒你加進去。

### 手動下載 Release

到 [`github.com/neokn/elegent/releases`](https://github.com/neokn/elegent/releases) 手動下載對應版本的 `elgt-darwin-arm64`，改名成 `elgt`、給執行權限、自行移除 quarantine 標記：

```sh
mkdir -p ~/.local/bin
mv ~/Downloads/elgt-darwin-arm64 ~/.local/bin/elgt
chmod +x ~/.local/bin/elgt
xattr -d com.apple.quarantine ~/.local/bin/elgt
```

若你是在自己 fork 出去的版本上操作，記得把上面兩種方式裡的 `neokn/elegent` 換成你自己的 `owner/repo`（`install.sh` 裡的 `REPO` 變數也要同步改），並自行推 `v*` tag 跑過 release workflow 發布你自己的 Release。

### 從原始碼建置（開發者／其他平台）

需要先安裝 [Bun](https://bun.sh)。在專案根目錄：

```sh
bun install
bun run build
```

`bun run build` 執行 `scripts/build.ts`，實際上跑：

```sh
bun build --compile --target=bun-darwin-arm64 src/presentation/cli/elgt.ts \
  --outfile dist/elgt --define "process.env.ELEGENT_COMPILED='1'"
```

會在 `dist/elgt`（gitignored，不會被提交）產出一顆單一原生執行檔，把它複製或連結到 `PATH` 上的資料夾即可：

```sh
cp dist/elgt ~/.local/bin/elgt
elgt version
```

看到版本號（例如 `0.3.0`）印出來即成功。`bun run build` 目前只鎖定 `bun-darwin-arm64` 這個編譯目標；其他平台（Intel Mac、Linux、Windows）沒有現成執行檔，也還不在建置矩陣的支援範圍內。若你在其他平台開發，或不想編譯，直接以「開發模式」執行即可：

```sh
bun src/presentation/cli/elgt.ts <command>
# 或（package.json 裡的別名）
bun run elgt <command>
```

---

## 快速開始

裝好 `elgt` 後，在任何空資料夾裡：

```sh
mkdir my-memory && cd my-memory
elgt init
```

`elgt init [dir]`（省略 `dir` 時預設當前目錄）在互動式終端會開啟設定精靈，讓你選 vault 目錄名稱，以及 Claude／Codex／Antigravity 三個 agent CLI 的 hooks 各自要裝在 project scope、user scope、local scope，或先不安裝（none）。非互動環境會沿用預設：vault 目錄名 `vault/`、三個 agent CLI **都裝 user scope**。也可以直接用 flags 指定：

```sh
elgt init ~/my-memory --vault-name memory --claude-scope user --codex-scope project --agy-scope none
```

它會在資料夾內一次鋪好整套系統：vault（PARA + palace；預設名 `vault/`——但只要任一 agent CLI 用了 project/local scope，vault 會改成嵌入 targetDir 內的 `<資料夾 slug>.vault/`，local scope 則額外隱藏並自動加進 `.gitignore`，見〈[Vault 怎麼組織](#vault-怎麼組織)〉）、各 agent CLI 的 digest skill 檔（`.claude/skills/digest/SKILL.md` 等）、hooks 設定、`.gitignore`，並依 scope 自動註冊 `elegent-memory` MCP server（見〈[接上其他 AI 工具](#接上其他-ai-工具mcp)〉）。**`elgt init` 不會寫入 `CLAUDE.md`／`AGENTS.md`／`.mcp.json`**——這些人設檔已經被拿掉，agent 行為改由 digest skill＋MCP server＋hooks 設定三者承載。同時會初始化 git repo、建立第一個 commit（若已是 git repo 或初始化失敗，只會印警告、不會中斷流程）。project scope 會寫進該資料夾的 `.claude/`／`.codex/`／`.agents/`；user scope 會寫進 `~/.claude/`／`~/.codex/`／`~/.gemini/config/`；hook command 會帶上 `ELEGENT_ROOT` 和 `ELEGENT_VAULT_NAME`，確保全域 hook 仍寫回這座記憶。這些檔案裡，`.gitignore`／skill 檔採**冪等寫入**（已存在就跳過不覆蓋），hooks／MCP 設定則是**冪等合併**（保留既有內容，只補上缺的條目）。跑完後它會印出新增了哪些檔案，以及下一步：

1. **編輯 `vault/palace/wake/identity.md`**——寫下你是誰、身邊關鍵的人、希望 AI 怎麼跟你互動。這是唯一需要你親手寫的檔案（`user_managed: true`，LLM 只讀不改，由 `elgt guard` 保護），會在每次新對話開場被自動想起。
2. （建議）用 [Obsidian](https://obsidian.md) 把 `vault/` 資料夾打開當 vault，像逛筆記一樣瀏覽、雙向連結你的記憶——純粹方便你自己看，不影響 AI 使用。
3. 在這個資料夾裡開 Claude Code（若已開著，重啟或開新對話）——因為 `init` 已經依你選的 scope 把 hooks 與 `elegent-memory` MCP server 設定寫好了（預設 user scope 是寫進 `~/` 底下，跨專案共用），記憶會自動生效：開場想起你、對話自動存底。

---

## CLI 指令

| 指令 | 說明 |
|---|---|
| `elgt hook <claude\|codex\|agy> <event>` | 執行對應 agent CLI 的 hook（讀 stdin 的 JSON）。claude 事件：`stop\|precompact\|sessionend\|sessionstart`；codex 事件：`stop\|precompact`；agy（Antigravity）事件：`postinvocation\|stop`。由 `elgt init` 寫進對應設定檔，一般不需要手動呼叫。裸 `elgt hook <event>`（不帶 backend）是舊版遺留的 Claude 相容別名，已 deprecated。 |
| `elgt init [dir] [--vault-name name] [--claude-scope project\|user\|local\|none] [--codex-scope project\|user\|local\|none] [--agy-scope project\|user\|local\|none] [--yes]` | 在（通常是空的）資料夾裡建立完整記憶系統。三個 scope 預設都是 `user`；`local` 不能與 `project`/`user` 混用。互動式終端會開 wizard；`--yes` 使用預設值。 |
| `elgt reindex [vault]` | 重新生成各資料夾的 `index.md`。省略 `vault` 預設 `./vault`。 |
| `elgt lint [vault]` | 檢查 vault 是否違反格式鐵律；有違規時 exit code 1。省略 `vault` 預設 `./vault`。 |
| `elgt guard <file>` | 檢查單一檔案是否違反 `palace/raw` 的 append-only 規則，也是唯一會檢查 `user_managed: true` 檔案有沒有被改動的指令。 |
| `elgt backfill [projectsDir]` | 回填既有、尚未歸檔的逐字對話 session。 |
| `elgt mcp` | 啟動 `elegent-memory` MCP server（stdio），會持續執行直到被外部終止。 |
| `elgt version` | 印出版本字串。 |

未知的子指令或缺少必要參數，會把用法印到 stderr、以 exit code 2 結束。

開發模式下，以上每個子指令都能用 `bun src/presentation/cli/elgt.ts <command>` 或對應的 `bun run <script>` 直接跑（見〈[開發](#開發)〉一節的對照）。

---

## 日常使用

**對話自動歸檔**：不需要手動存檔。Claude Code 的 hooks（`elgt init` 已掛好）會在三個時機把逐字紀錄寫進 `vault/palace/raw/conversations/`：對話進行中（定期）、壓縮對話前（避免舊內容被壓縮掉）、對話結束時（連短對話也不漏）。

**蒸餾（`/digest`）**：逐字紀錄只是存證，還沒整理成正式條目。想把累積的紀錄整理進 wiki 時，跟 Claude Code 說「消化」「蒸餾」或直接打 `/digest`。它會：

1. 讀 `.elegent-state/digest-cursor`，找出新增或變長的逐字檔。
2. 針對每個檔案，把內容路由到最合適的 PARA 頁面（project/area/resource）或實體檔案，只合併淨新增的資訊（沒有新東西就跳過）。
3. 更新實體檔的 `## Facts` 表——用 `valid_to` 讓舊事實作廢，不刪列。
4. 對每個寫入的檔案跑 `guard`。
5. 在 `palace/map.md` 追加指標，必要時重編 `essential-story.md`。
6. 記錄新的 cursor、重新 `reindex`、`lint` 到 0 errors、寫 log、`git commit`。

**保養指令**（都在 vault 所在資料夾內執行）：

- `elgt lint`——健康檢查，回報 `0 errors` 代表整齊；分兩級：硬錯誤（frontmatter/type 壞掉、出現 wikilink、Facts 表日期顛倒）與軟提醒（缺描述、斷連結等）。唯讀檔（`user_managed: true`）是否被改動，`lint` 不檢查，是 `elgt guard <file>` 的職責。
- `elgt backfill`——把因當機或漏歸檔而遺漏的逐字 session 補進書庫。
- `elgt reindex`——手動重生 `index.md`（平常系統會在歸檔成功後自動重生，不需要手動跑）。
- git 版本安全網——`elgt init` 已建好 git repo，之後每次蒸餾都會自動 commit 一個存檔點，任何整理都能反悔、退回上一版。

**可選：自動蒸餾**——設定環境變數 `ELEGENT_AUTO_DIGEST=1`，系統會在每次對話結束、且這次有成功歸檔到新素材時，於背景自動跑一次 `/digest`，不需要手動喊「蒸讚」。這會實際消耗 API 額度／訂閱用量，因此預設關閉，請自行評估後再開啟。跑得順不順，可以看 `.elegent-state/autodigest.log`。

---

## 接上其他 AI 工具（MCP）

每座 vault 都附一個 `elegent-memory` MCP server（`elgt mcp` 啟動，over stdio），任何支援 MCP 的工具掛上它就能讀取你這座書庫（只讀不寫）。

在 `elgt init` 產生的資料夾裡，Claude／Codex 是靠實際呼叫官方 `claude mcp add`／`codex mcp add` 註冊（依你選的 scope 寫進各自 CLI 自己的設定），不需要你手動再設定一次；Antigravity（agy）則只有 **user scope** 會把設定合併進 `~/.gemini/config/mcp_config.json`——agy 的 project/local scope 不會自動註冊 MCP（`elgt init` 執行時會印警告提醒）。要接到 `elgt init` **沒有**自動註冊的地方（例如另一支支援 MCP 的工具、或 agy 的 project/local scope），用環境變數 `ELEGENT_VAULT` 指到 vault 的絕對路徑，通用參數就是這三件：

| 欄位 | 值 | 說明 |
|---|---|---|
| 啟動指令 | `elgt` | 終端機類工具通常找得到 PATH 上的 `elgt`；GUI app（如 Claude Desktop）讀不到終端機 PATH，請用 `which elgt` 查出的絕對路徑。 |
| 參數 | `["mcp"]` | 叫 `elgt` 以 MCP server 模式啟動。 |
| 環境變數 | `ELEGENT_VAULT=/絕對路徑/vault` | 指到你的 vault；省略的話伺服器只會找當前工作目錄下的 `vault/`，多半找不到。 |

開發模式的等價寫法：`command: "bun"`、`args: ["/絕對路徑/src/presentation/mcp/server.ts"]`。

掛上後，AI 手上會有四個記憶工具（不需要你直接操作，AI 會依需要自己挑）：

| 工具 | 用途 |
|---|---|
| `memory_wake` | 開場想起你——回傳身分（identity）＋現在最重要的事（essential-story）。 |
| `memory_search` | 對整座書庫的筆記做關鍵字搜尋，回傳命中的檔案:行號:片段。 |
| `memory_read` | 把搜尋定位到的某一頁整篇讀進來看細節。 |
| `memory_list` | 列出 vault 某一層的目錄與檔案，像逛書架一樣導覽。 |

---

## Vault 怎麼組織

`elgt init` 用預設 scope（三個 agent CLI 都是 user scope）跑完後，目標資料夾大致長這樣：

```
my-memory/
├── .gitignore
└── vault/
    ├── index.md                     # 生成物，見「格式鐵律」
    ├── .obsidian/app.json           # Obsidian 設定（相對連結格式），開 vault 時免調整
    ├── .claude/skills/digest/SKILL.md   # /digest 蒸餾技能（symlink 到內嵌模板）
    ├── .codex/skills/digest/SKILL.md
    ├── .agents/skills/digest/SKILL.md
    ├── projects/                    # PARA：進行中的專案
    ├── areas/                       # PARA：長期責任
    ├── resources/                   # PARA：知識主題
    ├── archives/                    # PARA：已完結
    └── palace/                      # 記憶宮殿（給 LLM）
        ├── wake/
        │   ├── identity.md          # user_managed: true，只讀，你手寫
        │   └── essential-story.md   # 由 /digest 依活躍專案重編譯
        ├── map.md                   # 壓縮指標索引，miss 時 fallback 全文 grep
        ├── log.md
        ├── entities/                 # 人／組織／工具的事實表
        └── raw/                       # append-only 逐字存證
            ├── conversations/
            ├── clippings/
            └── journal/
```

user scope 的 hooks／MCP 設定不會出現在這個資料夾裡，而是寫進 `~/.claude/`、`~/.codex/`、`~/.gemini/config/`（跨專案共用同一份全域設定）。

若某個 agent CLI 的 scope 選了 **project**，vault 會改成嵌入 targetDir 內、可見、進版控的 `<資料夾 slug>.vault/`（例如 `my-app.vault/`），hooks 設定也會寫進該資料夾自己的 `.claude/`／`.codex/`／`.agents/`；選 **local** 則同 project，但目錄名變成隱藏的 `.<資料夾 slug>.vault/` 且自動加進 `.gitignore`，不會被專案 git 追蹤。`local` 不能與 `project`/`user` 混用。

PARA 是「閱覽室」：整理好、給人看的成果。palace 是「書庫」：AI 靠它跨對話記得事情——`wake/` 是每次對話開場都會注入的常駐內容，`map.md` 是掃描用的壓縮指標，`entities/` 存長期事實，`raw/` 保留一字不改的原始存證，讓蒸餾/綜合出來的內容永遠能追回證據。

---

## 格式鐵律

- 每個非保留 `.md` 必有 frontmatter，`type` ∈ `note|moc|entity|raw-log|wake|daily`。
- 內部連結一律用純 markdown `[標題](相對路徑.md)`；body 內文禁用 Obsidian `[[wikilink]]`、`![[embed]]`。
- 檔名 = 唯一 slug（小寫、`-`）；人味放 `title`/`aliases`。
- entity 頁固定槽位：`## Facts`（時間性事實表——舊事實填 `valid_to` 作廢，絕不刪列）+ `## Links` + `## Citations`。
- `index.md` 是生成物（`elgt reindex`），不要手改；導覽改 `palace/map.md`。
- `user_managed: true` 的檔（如 `identity.md`）只讀，AI 不會改動。

以上規則不是每一條都被 `elgt lint`（`src/core/application/lint.ts` + `frontmatter.ts`）機器強制。真正會讓 `lint` 回報硬錯誤的只有：frontmatter 缺失／`type` 不在詞彙表、body 出現 wikilink、`## Facts` 表日期區間顛倒；斷掉的相對連結只算警告。檔名=slug、entity 頁三個槽位是否齊全、`index.md` 別手改，目前都只是約定，`lint` 不會檢查。`user_managed: true` 檔案有沒有被改動，是由**另一支獨立指令** `elgt guard <file>`（比對 git HEAD 前後內容）檢查，不是 `elgt lint`；`palace/raw` 的 append-only 規則也是 `elgt guard` 負責。

---

## 多座記憶

在不同資料夾各跑一次 `elgt init`，就會有各自獨立的記憶系統——各自的 vault、各自的內容、互不干擾。在某座 vault 自己的資料夾裡開 Claude Code 不需要額外設定；要把某座記憶掛到別的 App／專案，用 `ELEGENT_VAULT` 指到對應的 vault 絕對路徑即可（見〈[接上其他 AI 工具](#接上其他-ai-工具mcp)〉）。

---

## 開發

以下是給想修改 EleGent 本身（而不是用它管理自己記憶）的開發者的簡短說明。

### 環境需求

需要 [Bun](https://bun.sh)。`bun install` 後即可執行 `package.json` 裡的腳本。

### 常用指令

| 想做的事 | 指令 |
|---|---|
| 跑全部測試 | `bun test` |
| 直接以開發模式呼叫 elgt | `bun run elgt <command>`（= `bun src/presentation/cli/elgt.ts <command>`） |
| 在 repo 裡鋪出一份本機 vault 骨架 | `bun run scaffold [dir]` |
| 重生目錄索引 | `bun run reindex [vault]` |
| 檢查 vault 格式 | `bun run lint:vault [vault]`（= `bun src/presentation/cli/lint.ts`） |
| 回填既有逐字稿 | `bun run backfill [projectsDir]` |
| 編譯單一執行檔 | `bun run build` → 產出 `dist/elgt`（gitignored） |
| 跑編譯後執行檔的端對端 smoke test | `bun run smoke` |
| 檢查 digest skill 單一來源 | `bun test src/core/application/templates.test.ts` |

`bun run smoke`（`scripts/smoke.ts`）需要 `dist/elgt` 已存在——沒有的話會提示先跑 `bun run build`。它會在暫存資料夾裡跑編譯出的執行檔，檢查：`init --*-scope none` 產生 `vault/` 但**不**產生 `CLAUDE.md`/`AGENTS.md`/`.mcp.json`；獨立 tmp dir 用 `--claude-scope project` 驗證 `.claude/settings.json` 的 hook command 確實含編譯後執行檔的絕對路徑、且帶正確的 `ELEGENT_ROOT`/`ELEGENT_VAULT_NAME`；`lint <vault>` 回報 `0 errors`；`version` 印出預期版本；設定 `ELEGENT_VAULT` 後 `mcp` 對 JSON-RPC `initialize` 請求正確回應；設定 `CLAUDE_PROJECT_DIR` 後 `hook claude sessionstart` 輸出 `additionalContext`；合成一份 Codex rollout 後 `hook codex precompact` 能正確歸檔。最後印 `SMOKE PASS`／`SMOKE FAIL` 並以對應的 exit code 結束。

注意：`bun run scaffold` 是「在既有開發專案裡鋪出書庫結構」，屬於 repo 內部的開發指令；`elgt init` 才是給一般使用者、在任意空資料夾建立獨立記憶系統的入口——兩者用途不同，不要混用。

### `src/` 目錄結構

- `src/presentation/cli/`——`elgt` 各子指令的入口（`init`、`reindex`、`lint`、`guard`、`backfill`、`mcp`、`hook`），各自搭配一份 `.test.ts`；另外還有一支 `scaffold.ts`，見下方說明。
- `src/core/`——CLI / hooks / MCP 共用的核心邏輯，依 Explicit Architecture 分兩層：`domain/`（純規則，如 `frontmatter`、`safety`、`dates`、`noise`、`guard`）與 `application/`（用例，如 `bootstrap` 的 `init` 流程、`scaffold` 的 vault 骨架、`indexgen`、`lint`、`wake`、`templates`、`vault-naming`、`config-merge`，以及 `application/transcript/` 底下 `claude`/`codex`/`agy` 三支逐字稿翻譯器）；`ports.ts`（`FileStore`/`GitRunner`/`McpRegistrar` 等 port 介面）與 `version.ts` 留在 core 根目錄。其中 `scaffold.ts` 除了被 `bootstrap` 呼叫，本身也有獨立 CLI 入口（`src/presentation/cli/scaffold.ts`）——這支**不在** `elgt` 的路由裡（沒有 `elgt scaffold`），只能用 `bun run scaffold` 直接呼叫，是給這個 repo 自己開發用的骨架產生器。
- `src/presentation/hooks/`——各 agent CLI 的 lifecycle hooks，後端＝資料夾、事件＝檔名：`claude/{stop,precompact,sessionend,sessionstart}.ts`、`codex/{stop,precompact}.ts`、`agy/hook.ts`。既是 `elgt init` 寫進使用者設定的內容，也「dogfood」式地掛在這個 repo 自己的 `.claude/settings.json`／`.agents/hooks.json` 上。
- `src/infrastructure/`——`adapters/`（`node-fs`/`node-git` 實作 Core port、`codex-sessions` 定位 Codex rollout 檔、`agent-cli` 呼叫 `claude`/`codex mcp add`）之外，還有 `state.ts`（節流游標＋hooks.log）與 `autodigest.ts`（spawn `claude -p /digest`）——這兩支沒有實作 Core port，是純 infra helper，**不在** `src/core/` 底下。
- `src/presentation/mcp/`——`elegent-memory` MCP server。
- `src/assets/`——vault/config 模板來源，目前只有 3 個檔：`gitignore.tmpl.md`、`skill-digest.md`、`codex-mcp.tmpl.md`。`elgt init` 不再往使用者 vault 寫 `CLAUDE.md`/`AGENTS.md`/根 `.mcp.json`；hooks/MCP 設定改由 `src/core/application/config-merge.ts` 冪等合併產生，不再走靜態模板。本 repo dogfood 的 `.claude/skills/digest/SKILL.md`、`.codex/skills/digest/SKILL.md`、`.agents/skills/digest/SKILL.md` 都 symlink 到 `src/assets/skill-digest.md`，避免多份 digest 流程漂移。
- `scripts/`——`build.ts`（編譯到 `dist/`）、`smoke.ts`、`extract-templates.ts`。
- `docs/manual/`——給終端使用者看的 `elgt` 完整使用手冊（不是開發文件）。

### `vault/` 只存在於本機，不進版本控制

`vault/` 已列在 `.gitignore`，不會被提交——這是刻意的選擇：這個 repo 是 `elgt` 工具本身的原始碼，不是一份要長期累積的真實 vault，本機這份只是驗證用、隨時可丟的實例。跑 `bun run scaffold`（或 `bun src/presentation/cli/elgt.ts init .`）會在 repo 根目錄建一份可丟棄的 `vault/`，純粹讓開發者手動對著一份真實實例跑 `lint`、`reindex`、hooks。`lint:vault` / `reindex` 在沒有指定路徑時，預設就是操作 `./vault`。想重置的話刪掉 `vault/` 資料夾、重新跑 scaffold 即可。

### Digest skill 單一來源

開發者直接編輯 `src/assets/skill-digest.md`。本 repo 裡 `.claude/skills/digest/SKILL.md`、`.codex/skills/digest/SKILL.md`、`.agents/skills/digest/SKILL.md` 都是 symlink，指回這個檔案；`elgt init` 也會把同一份內容寫進新 vault 的 Claude/Codex/Antigravity skill 位置。`src/core/application/templates.test.ts` 會防止 `.claude` dogfood skill 與 `src/assets/skill-digest.md` 漂移。

### CI / Release

`.github/workflows/release.yml` 是目前唯一的 workflow，在推送 `v*` tag 時觸發：在 `macos-14`（arm64）上跑 `bun install`、`bun test`，驗證推送的 tag 與 `src/core/version.ts` 的 `VERSION`（目前是 `0.3.0`）一致，跑 `bun run build`，再跑 `bun scripts/smoke.ts` 做端對端驗證後才發佈 Release（含編譯出的執行檔與 `install.sh`）。

---

## 授權

目前 repo 根目錄沒有 `LICENSE` 檔案，尚未附加任何開放原始碼授權條款。若需要重製或散布，請先向專案維護者確認授權條件。
