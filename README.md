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

⚠️ **這個 repo 目前沒有設定 git remote，也還沒發布過任何 GitHub Release**——`install.sh` 裡的 `neokn/EleGent` 只是佔位用的 repo 名稱（腳本自己的註解就寫著「換成自己 fork 的 owner/repo 就能安裝自己編譯的版本」），下面兩種靠 GitHub Release 的安裝方式現在都還連不到真正的下載檔。**現在唯一保證可用的方式是「從原始碼建置」**；等這個 repo（或你 fork 出去的版本）實際推上 GitHub、跑過 `.github/workflows/release.yml` 發布 Release 之後，一行安裝腳本／手動下載才會真的可用。

### 從原始碼建置（目前唯一可用的方式）

需要先安裝 [Bun](https://bun.sh)。在專案根目錄：

```sh
bun install
bun run build
```

`bun run build` 執行 `scripts/build.ts`，實際上跑：

```sh
bun build --compile --target=bun-darwin-arm64 tools/presentation/cli/elgt.ts \
  --outfile dist/elgt --define "process.env.ELEGENT_COMPILED='1'"
```

會在 `dist/elgt`（gitignored，不會被提交）產出一顆單一原生執行檔，把它複製或連結到 `PATH` 上的資料夾即可：

```sh
cp dist/elgt ~/.local/bin/elgt
elgt version
```

看到版本號（例如 `0.3.0`）印出來即成功。`bun run build` 目前只鎖定 `bun-darwin-arm64` 這個編譯目標；其他平台（Intel Mac、Linux、Windows）沒有現成執行檔，也還不在建置矩陣的支援範圍內。若你在其他平台開發，或不想編譯，直接以「開發模式」執行即可：

```sh
bun tools/presentation/cli/elgt.ts <command>
# 或（package.json 裡的別名）
bun run elgt <command>
```

### 之後：一行安裝腳本 / 手動下載 Release（repo 一旦發布 Release 就能用）

一旦這個 repo（或你 fork 的版本）推上 GitHub 並發布過 Release，`install.sh` 支援的兩種方式就會可用：

```sh
curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/install.sh | bash
```

會從對應 repo 的 GitHub Release 下載 `elgt-darwin-arm64`，裝到 `~/.local/bin/elgt`、`chmod +x`，並自動移除 macOS 下載檔會被加上的 quarantine 標記；`~/.local/bin` 不在 `PATH` 裡的話會提醒你加進去。或者直接到 `github.com/<owner>/<repo>/releases` 手動下載同一份 `elgt-darwin-arm64`，改名成 `elgt`、給執行權限、自行移除 quarantine 標記：

```sh
mkdir -p ~/.local/bin
mv ~/Downloads/elgt-darwin-arm64 ~/.local/bin/elgt
chmod +x ~/.local/bin/elgt
xattr -d com.apple.quarantine ~/.local/bin/elgt
```

`<owner>/<repo>` 要換成 `install.sh` 裡 `REPO` 變數實際指向的值。

---

## 快速開始

裝好 `elgt` 後，在任何空資料夾裡：

```sh
mkdir my-memory && cd my-memory
elgt init
```

`elgt init [dir]`（省略 `dir` 時預設當前目錄）會在資料夾內一次鋪好整套系統：`vault/`（PARA + palace）、`CLAUDE.md`、`.mcp.json`、`.claude/settings.json`（掛好對話自動歸檔的 hooks）、`.claude/skills/digest/SKILL.md`（蒸餾技能）、`.gitignore`，並初始化 git repo、建立第一個 commit（若已是 git repo 或初始化失敗，只會印警告、不會中斷流程）。這些檔案採**冪等寫入**：已存在的檔案不會被覆蓋。跑完後它會印出新增了哪些檔案，以及下一步：

1. **編輯 `vault/palace/wake/identity.md`**——寫下你是誰、身邊關鍵的人、希望 AI 怎麼跟你互動。這是唯一需要你親手寫的檔案（`user_managed: true`，LLM 只讀不改），會在每次新對話開場被自動想起。
2. （建議）用 [Obsidian](https://obsidian.md) 把 `vault/` 資料夾打開當 vault，像逛筆記一樣瀏覽、雙向連結你的記憶——純粹方便你自己看，不影響 AI 使用。
3. 在這個資料夾裡開 Claude Code（若已開著，重啟或開新對話）——因為 `init` 已經把 hooks 與 `elegent-memory` MCP server 都寫進這個資料夾的設定，記憶會自動生效：開場想起你、對話自動存底。

---

## CLI 指令

| 指令 | 說明 |
|---|---|
| `elgt hook <stop\|precompact\|sessionend\|sessionstart>` | 執行對應的 Claude Code hook（讀 stdin 的 JSON）。由 `elgt init` 寫進 `.claude/settings.json`，一般不需要手動呼叫。 |
| `elgt init [dir]` | 在（通常是空的）資料夾裡建立完整記憶系統。省略 `dir` 預設為當前目錄。 |
| `elgt reindex [vault]` | 重新生成各資料夾的 `index.md`。省略 `vault` 預設 `./vault`。 |
| `elgt lint [vault]` | 檢查 vault 是否違反格式鐵律；有違規時 exit code 1。省略 `vault` 預設 `./vault`。 |
| `elgt guard <file>` | 檢查單一檔案是否違反 `palace/raw` 的 append-only 規則。 |
| `elgt backfill [projectsDir]` | 回填既有、尚未歸檔的逐字對話 session。 |
| `elgt mcp` | 啟動 `elegent-memory` MCP server（stdio），會持續執行直到被外部終止。 |
| `elgt version` | 印出版本字串。 |

未知的子指令或缺少必要參數，會把用法印到 stderr、以 exit code 2 結束。

開發模式下，以上每個子指令都能用 `bun tools/presentation/cli/elgt.ts <command>` 或對應的 `bun run <script>` 直接跑（見〈[開發](#開發)〉一節的對照）。

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

- `elgt lint`——健康檢查，回報 `0 errors` 代表整齊；分兩級：硬錯誤（格式壞掉、動到只讀檔）與軟提醒（缺描述、斷連結等）。
- `elgt backfill`——把因當機或漏歸檔而遺漏的逐字 session 補進書庫。
- `elgt reindex`——手動重生 `index.md`（平常系統會在歸檔成功後自動重生，不需要手動跑）。
- git 版本安全網——`elgt init` 已建好 git repo，之後每次蒸餾都會自動 commit 一個存檔點，任何整理都能反悔、退回上一版。

**可選：自動蒸餾**——設定環境變數 `ELEGENT_AUTO_DIGEST=1`，系統會在每次對話結束、且這次有成功歸檔到新素材時，於背景自動跑一次 `/digest`，不需要手動喊「蒸讚」。這會實際消耗 API 額度／訂閱用量，因此預設關閉，請自行評估後再開啟。跑得順不順，可以看 `.elegent-state/autodigest.log`。

---

## 接上其他 AI 工具（MCP）

每座 vault 都附一個 `elegent-memory` MCP server（`elgt mcp` 啟動，over stdio），任何支援 MCP 的工具掛上它就能讀取你這座書庫（只讀不寫）。

在 `elgt init` 產生的資料夾裡不需要額外設定——`.mcp.json` 已指向當前工作目錄下的 `vault/`。要接到**別的**資料夾／App，用環境變數 `ELEGENT_VAULT` 指到 vault 的絕對路徑，通用參數就是這三件：

| 欄位 | 值 | 說明 |
|---|---|---|
| 啟動指令 | `elgt` | 終端機類工具通常找得到 PATH 上的 `elgt`；GUI app（如 Claude Desktop）讀不到終端機 PATH，請用 `which elgt` 查出的絕對路徑。 |
| 參數 | `["mcp"]` | 叫 `elgt` 以 MCP server 模式啟動。 |
| 環境變數 | `ELEGENT_VAULT=/絕對路徑/vault` | 指到你的 vault；省略的話伺服器只會找當前工作目錄下的 `vault/`，多半找不到。 |

開發模式的等價寫法：`command: "bun"`、`args: ["/絕對路徑/tools/presentation/mcp/server.ts"]`。

掛上後，AI 手上會有四個記憶工具（不需要你直接操作，AI 會依需要自己挑）：

| 工具 | 用途 |
|---|---|
| `memory_wake` | 開場想起你——回傳身分（identity）＋現在最重要的事（essential-story）。 |
| `memory_search` | 對整座書庫的筆記做關鍵字搜尋，回傳命中的檔案:行號:片段。 |
| `memory_read` | 把搜尋定位到的某一頁整篇讀進來看細節。 |
| `memory_list` | 列出 vault 某一層的目錄與檔案，像逛書架一樣導覽。 |

---

## Vault 怎麼組織

`elgt init` 產生的目錄大致長這樣：

```
my-memory/
├── CLAUDE.md
├── .mcp.json
├── .claude/
│   ├── settings.json          # 掛好對話自動歸檔的 hooks
│   └── skills/digest/SKILL.md # /digest 蒸餾技能
├── .gitignore
└── vault/
    ├── index.md                # 生成物，見「格式鐵律」
    ├── .obsidian/app.json      # Obsidian 設定（相對連結格式），開 vault 時免調整
    ├── projects/                # PARA：進行中的專案
    ├── areas/                   # PARA：長期責任
    ├── resources/                # PARA：知識主題
    ├── archives/                  # PARA：已完結
    └── palace/                    # 記憶宮殿（給 LLM）
        ├── wake/
        │   ├── identity.md         # user_managed: true，只讀，你手寫
        │   └── essential-story.md  # 由 /digest 依活躍專案重編譯
        ├── map.md                  # 壓縮指標索引，miss 時 fallback 全文 grep
        ├── log.md
        ├── entities/                # 人／組織／工具的事實表
        └── raw/                      # append-only 逐字存證
            ├── conversations/
            ├── clippings/
            └── journal/
```

PARA 是「閱覽室」：整理好、給人看的成果。palace 是「書庫」：AI 靠它跨對話記得事情——`wake/` 是每次對話開場都會注入的常駐內容，`map.md` 是掃描用的壓縮指標，`entities/` 存長期事實，`raw/` 保留一字不改的原始存證，讓蒸餾/綜合出來的內容永遠能追回證據。

---

## 格式鐵律

- 每個非保留 `.md` 必有 frontmatter，`type` ∈ `note|moc|entity|raw-log|wake|daily`。
- 內部連結一律用純 markdown `[標題](相對路徑.md)`；body 內文禁用 Obsidian `[[wikilink]]`、`![[embed]]`。
- 檔名 = 唯一 slug（小寫、`-`）；人味放 `title`/`aliases`。
- entity 頁固定槽位：`## Facts`（時間性事實表——舊事實填 `valid_to` 作廢，絕不刪列）+ `## Links` + `## Citations`。
- `index.md` 是生成物（`elgt reindex`），不要手改；導覽改 `palace/map.md`。
- `user_managed: true` 的檔（如 `identity.md`）只讀，AI 不會改動。

以上規則由 `tools/core/lint.ts` / `frontmatter.ts` 檢查（`elgt lint`），連同斷掉的相對連結、Facts 表日期區間顛倒等問題；`palace/raw` 的 append-only 規則另由 `elgt guard <file>` 檢查。

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
| 直接以開發模式呼叫 elgt | `bun run elgt <command>`（= `bun tools/presentation/cli/elgt.ts <command>`） |
| 在 repo 裡鋪出一份本機 vault 骨架 | `bun run scaffold [dir]` |
| 重生目錄索引 | `bun run reindex [vault]` |
| 檢查 vault 格式 | `bun run lint:vault [vault]`（= `bun tools/presentation/cli/lint.ts`） |
| 回填既有逐字稿 | `bun run backfill [projectsDir]` |
| 編譯單一執行檔 | `bun run build` → 產出 `dist/elgt`（gitignored） |
| 跑編譯後執行檔的端對端 smoke test | `bun run smoke` |
| 把 SKILL.md 同步進範本 | `bun run extract-templates` |

`bun run smoke`（`scripts/smoke.ts`）需要 `dist/elgt` 已存在——沒有的話會提示先跑 `bun run build`。它會在暫存資料夾裡跑編譯出的執行檔，檢查：`init` 產生的 vault/CLAUDE.md/.mcp.json 裡有正確、絕對路徑的執行檔指令；`lint <vault>` 回報 `0 errors`；`version` 印出預期版本；設定 `ELEGENT_VAULT` 後 `mcp` 對 JSON-RPC `initialize` 請求正確回應；設定 `CLAUDE_PROJECT_DIR` 後 `hook sessionstart` 輸出 `additionalContext`。最後印 `SMOKE PASS`／`SMOKE FAIL` 並以對應的 exit code 結束。

注意：`bun run scaffold` 是「在既有開發專案裡鋪出書庫結構」，屬於 repo 內部的開發指令；`elgt init` 才是給一般使用者、在任意空資料夾建立獨立記憶系統的入口——兩者用途不同，不要混用。

### `tools/` 目錄結構

- `tools/presentation/cli/`——`elgt` 各子指令的入口（`init`、`reindex`、`lint`、`guard`、`backfill`、`mcp`、`hook`），各自搭配一份 `.test.ts`。
- `tools/core/`——CLI / hooks / MCP 共用的核心邏輯：`bootstrap`（`init` 流程）、`scaffold` 的 vault 骨架、`indexgen`、`lint`、`frontmatter`、`guard`、`archive`、`autodigest`、`dates`、`state`、`templates`、`version` 等。其中 `scaffold.ts` 除了被 `bootstrap` 呼叫，本身也有 CLI 入口——這支**不在** `elgt` 的路由裡（沒有 `elgt scaffold`），只能用 `bun run scaffold` 或 `bun tools/core/scaffold.ts` 直接呼叫，是給這個 repo 自己開發用的骨架產生器。
- `tools/presentation/hooks/`——Claude Code hooks（`stop`、`precompact`、`sessionend`、`sessionstart`），既是 `elgt init` 寫進使用者 vault 的內容，也「dogfood」式地掛在這個 repo自己的 `.claude/settings.json` 上。
- `tools/presentation/mcp/`——`elegent-memory` MCP server。
- `tools/assets/`——大部分 vault 範本的權威來源：`claude-md.md`、`settings-json.tmpl`、`mcp-json.tmpl`、`gitignore.tmpl`。`elgt init` 會把這些內容近乎原樣寫進新使用者的 vault（只替換 `{{ELEGENT_BIN}}` 佔位符）。`skill-digest.md` 是唯一例外——它的權威來源反過來是 `.claude/skills/digest/SKILL.md`，見下方「範本同步規則」。
- `scripts/`——`build.ts`（編譯到 `dist/`）、`smoke.ts`、`extract-templates.ts`。
- `docs/manual/`——給終端使用者看的 `elgt` 完整使用手冊（不是開發文件）。

### `vault/` 只存在於本機，不進版本控制

`vault/` 已列在 `.gitignore`，不會被提交——這是刻意的選擇：這個 repo 是 `elgt` 工具本身的原始碼，不是一份要長期累積的真實 vault，本機這份只是驗證用、隨時可丟的實例。跑 `bun run scaffold`（或 `bun tools/presentation/cli/elgt.ts init .`）會在 repo 根目錄建一份可丟棄的 `vault/`，純粹讓開發者手動對著一份真實實例跑 `lint`、`reindex`、hooks。`lint:vault` / `reindex` 在沒有指定路徑時，預設就是操作 `./vault`。想重置的話刪掉 `vault/` 資料夾、重新跑 scaffold 即可。

### 範本同步規則

開發者直接編輯 `.claude/skills/digest/SKILL.md`——這是 Claude Code 在這個 repo 裡開發時實際載入、可以立刻測試的檔案。`tools/core/templates.ts` 定義了 `DEV_ELEGENT_BIN = "bun tools/presentation/cli/elgt.ts"`（開發模式的呼叫形式）。跑 `bun run extract-templates`（`scripts/extract-templates.ts`）會讀取手改過的 `SKILL.md`，把 `DEV_ELEGENT_BIN` 換成通用的 `{{ELEGENT_BIN}}` 佔位符，寫回 `tools/assets/skill-digest.md`——這才是 `elgt init` 實際使用的範本。`tools/core/templates.test.ts` 會防止兩者漂移：斷言 `renderTemplate("skill-digest", { ELEGENT_BIN: DEV_ELEGENT_BIN })` 與 `.claude/skills/digest/SKILL.md` 的內容逐字元相同。

### CI / Release

`.github/workflows/release.yml` 是目前唯一的 workflow，在推送 `v*` tag 時觸發：在 `macos-14`（arm64）上跑 `bun install`、`bun test`，驗證推送的 tag 與 `tools/core/version.ts` 的 `VERSION`（目前是 `0.3.0`）一致，跑 `bun run build`，再跑 `bun scripts/smoke.ts` 做端對端驗證後才發佈 Release（含編譯出的執行檔與 `install.sh`）。

---

## 授權

目前 repo 根目錄沒有 `LICENSE` 檔案，尚未附加任何開放原始碼授權條款。若需要重製或散布，請先向專案維護者確認授權條件。
