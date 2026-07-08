# EleGent 架構 UML（四張聚焦圖）

> 四張 UML 各回答「一個問題」，對應 4+1 view model：Pattern class（development / 靜態結構）、Sequence（process / 執行期互動）、State machine（logical / 一段記憶的生命週期）、Activity（process / init 分支流程）。全部只描繪《架構共享模型》既有元件，不新增、不改名。
>
> 依賴方向恆為 `presentation → core ← infrastructure`；`src/architecture.test.ts` 以 CI 強制，違反即 build fail。

---

## 1. Pattern classDiagram — Ports & Adapters（Hexagonal）

**問題**：Core 怎麼在「不碰 `node:fs`／`Bun.spawn`」的前提下做 I/O？**受眾**：工程師。
**要點**：Core 擁有三個 port（`FileStore`／`GitRunner`／`CodexSessionLocator`），Infrastructure 提供唯一的 secondary/driven 實作（`..|>`），Core application 只依賴介面（`-->` uses），由 presentation 的兩個組裝根以 DI 注入具體 adapter（`..>` inject）。

```mermaid
classDiagram
    direction LR

    class FileStore {
        <<interface  core/ports>>
        +read(path) string
        +tryRead(path) string
        +write(path, content) void
        +mkdirp(path) void
        +exists(path) bool
        +lexists(path) bool
        +walkFiles(dir, ext) paths
        +symlink(target, link) void
    }
    class GitRunner {
        <<interface  core/ports>>
        +init(dir) Result
        +stageAll(dir) Result
        +commit(dir, msg) Result
        +diffNameStatus(cwd, path) Result
    }
    class CodexSessionLocator {
        <<interface  core/ports>>
        +locate(hookInput, cwd) Match
    }

    class nodeFileStore {
        <<adapter  node-fs>>
    }
    class nodeGitRunner {
        <<adapter  node-git>>
    }
    class nodeCodexSessionLocator {
        <<adapter  codex-sessions>>
    }

    nodeFileStore ..|> FileStore : implements
    nodeGitRunner ..|> GitRunner : implements
    nodeCodexSessionLocator ..|> CodexSessionLocator : implements

    class bootstrap {
        <<core application>>
        +bootstrap(store, git, dir, bin)
    }
    class writeConversationArchive {
        <<core application  transcript>>
    }
    class regenerateIndexes {
        <<core application  indexgen>>
    }
    class runCodexArchiveHook {
        <<core-consumed via deps>>
    }

    bootstrap --> FileStore : uses
    bootstrap --> GitRunner : uses
    writeConversationArchive --> FileStore : uses
    regenerateIndexes --> FileStore : uses
    runCodexArchiveHook --> CodexSessionLocator : uses dep
    runCodexArchiveHook --> FileStore : uses dep

    class elgtInit {
        <<presentation  cli/elgt>>
    }
    class runCodexHookEntry {
        <<presentation  hooks/codex/hook>>
    }

    elgtInit --> bootstrap : calls
    elgtInit ..> nodeFileStore : inject
    elgtInit ..> nodeGitRunner : inject
    runCodexHookEntry --> runCodexArchiveHook : calls
    runCodexHookEntry ..> nodeFileStore : inject
    runCodexHookEntry ..> nodeCodexSessionLocator : inject
```

實線 `-->`（uses）永遠指向 Core 的 port，具體 `node-*` adapter 只被 presentation 組裝根用 `..>`（inject）接進去——這就是「依賴向內、實作向外」在型別層的樣子。

---

## 2. Sequence — Codex PreCompact／Stop hook 歸檔一次互動

**問題**：一次 hook 事件如何把 Codex 逐字稿落進 `palace/raw`？**受眾**：工程師（process view）。
**要點**：`runCodexHookEntry` 是這條路徑的**組裝根**，讀完 stdin 後把 `nodeCodexSessionLocator`／`nodeFileStore`／`readLastSave·writeLastSave`／`regenerateIndexes` 注進 `runCodexArchiveHook`；節流門檻 `SAVE_INTERVAL=15` 只在 `stop` 模式擋，PreCompact 一律歸檔。

```mermaid
sequenceDiagram
    autonumber
    actor CX as Codex CLI
    participant PC as codex/precompact.ts
    participant EN as runCodexHookEntry (hook.ts 組裝根)
    participant UC as runCodexArchiveHook
    participant LOC as nodeCodexSessionLocator
    participant FS as nodeFileStore
    participant CO as transcript/codex (core)
    participant ST as state (游標)
    participant IDX as regenerateIndexes

    CX->>PC: PreCompact 事件 spawn 短命行程
    PC->>EN: runCodexHookEntry(["precompact"])
    EN->>EN: readStdinJson() 取 hook 輸入
    Note over EN: DI 注入 nodeCodexSessionLocator / nodeFileStore /<br/>readLastSave·writeLastSave / regenerateIndexes
    EN->>UC: runCodexArchiveHook(input, mode, deps)
    UC->>LOC: locate(input, repoRoot)
    LOC->>LOC: 掃 ~/.codex/sessions 依 sid 或 cwd 挑最新
    LOC-->>UC: {path, sessionId}
    UC->>FS: read(path) 讀 rollout 逐字稿
    FS-->>UC: jsonl text
    UC->>CO: renderCodexTranscript(text, path)
    CO-->>UC: RenderedCodexTranscript
    UC->>CO: countCodexUserMessages(text)
    CO-->>UC: count
    UC->>ST: readLastSave(root, sid)
    ST-->>UC: lastSave 游標
    alt mode=stop 且 count-lastSave 未達 SAVE_INTERVAL=15
        UC-->>EN: return 未達門檻 不寫檔
    else 達門檻 或 PreCompact
        UC->>CO: archiveCodexTranscript(nodeFileStore, path, vault, rendered)
        CO->>FS: write palace/raw/conversations/{slug}/{date}_{sid}.md
        FS-->>CO: written=true
        CO-->>UC: {written}
        UC->>ST: writeLastSave(root, sid, count) 推進游標
        UC->>IDX: regenerateIndexes(nodeFileStore, vaultRoot)
        IDX->>FS: 走訪 vault 重寫 index.md
    end
```

註：依共享模型，逐字稿的讀取畫成 `FileStore.read`（薄檔案系統 port）；寫檔一律經 `FileStore.write`，Core 全程不碰具體 I/O。

---

## 3. State machine — 一段記憶的生命週期

**問題**：一則對話從「進行中」到「被作廢的舊事實」經過哪些狀態？**受眾**：工程師（logical view）。
**要點**：`palace/raw` 是 append-only 的原始底稿（`raw-log`），`/digest` 才把它蒸餾成 PARA/entity 知識；entity 的 `## Facts` 用 `valid_to` 作廢舊事實而非刪列——時間性事實只增不減。

```mermaid
stateDiagram-v2
    state "對話進行中 (累積 user 訊息)" as Live
    state "raw-log @ palace/raw (append-only)" as Raw
    state "PARA / entity 知識 (/digest 蒸餾)" as Para
    state "entity ## Facts (時間性事實表)" as Facts

    [*] --> Live
    Live --> Live : 新 user 訊息 count++
    Live --> Raw : 達門檻 count-lastSave≥15 或 PreCompact 觸發歸檔
    Raw --> Raw : 後續只 append 絕不改寫既有底稿
    Raw --> Para : /digest 蒸餾成 PARA/entity 知識
    Para --> Facts : 事實寫入 entity ## Facts
    Facts --> Facts : 舊事實填 valid_to 作廢 (絕不刪列)
```

`Raw` 與 `Facts` 兩個自迴圈是本系統的核心不變式：**底稿只 append、事實只作廢**——`elgt lint`／`guard` 以 git diff 對 `palace/raw` 強制 append-only（UC7／UC8）。

---

## 4. Activity（flowchart）— `elgt init` bootstrap 分支流程

**問題**：`elgt init` 一鍵初始化時，哪些步驟會分支、哪些失敗只警告不中斷？**受眾**：工程師（process view）。
**要點**：模板逐檔冪等（存在則略過、絕不覆寫）；`AGENTS.md` symlink 失敗只警告；只有「非 git repo」才跑 `init → stageAll → commit`，且三步任一失敗都只 `warnings.push` 後照常回傳。

```mermaid
flowchart TD
    A(["elgt init &lt;targetDir&gt;"]) --> B["store.mkdirp(targetDir)"]
    B --> C["scaffoldVault(store, targetDir/vault)"]
    C --> D["regenerateIndexes(store, vault)"]
    D --> LOOP{"逐一 RENDERED_FILES<br/>settings / skill / CLAUDE.md / mcp / gitignore / codex-hooks"}
    LOOP -->|還有檔| EX{"store.exists(檔) ?"}
    EX -->|存在| SK["skipped.push 略過 (不覆寫)"] --> LOOP
    EX -->|不存在| WR["renderTemplate + store.write"] --> LOOP
    LOOP -->|全部處理完| LN{"store.lexists(AGENTS.md) ?"}
    LN -->|不存在| SYM["store.symlink(CLAUDE.md → AGENTS.md)"]
    SYM --> SYMOK{"symlink 成功 ?"}
    SYMOK -->|失敗| SYMW["warnings.push (fs 不支援符號連結)"]
    SYMOK -->|成功| GIT{".git 已存在 ?"}
    LN -->|存在| GIT
    SYMW --> GIT
    GIT -->|已是 git repo| DONE(["return {created, skipped, warnings}"])
    GIT -->|否| GI["GitRunner.init(targetDir)"]
    GI --> GIOK{"init ok ?"}
    GIOK -->|失敗| GIW["warnings.push (git init 失敗)"] --> DONE
    GIOK -->|成功| GA["GitRunner.stageAll(targetDir)"]
    GA --> GAOK{"stageAll ok ?"}
    GAOK -->|失敗| GAW["warnings.push (git add 失敗)"] --> DONE
    GAOK -->|成功| GC["GitRunner.commit(targetDir, 'init: 記憶系統初始化')"]
    GC --> GCOK{"commit ok ?"}
    GCOK -->|失敗| GCW["warnings.push (commit 失敗只警告)"] --> DONE
    GCOK -->|成功| DONE
```

全流程冪等：對同一 `targetDir` 重跑，第二次 `created` 為空、既有檔內容不變；git 三步的錯誤全數收斂成 `warnings`，UC1 保證 init 不因環境（無 git identity、fs 不支援 symlink）而 throw。

---

### 檔案錨點（供維護時對照程式碼）

- Port 定義：`src/core/ports.ts`（`FileStore` / `GitRunner` / `CodexSessionLocator`）
- Adapter 實作：`src/infrastructure/adapters/{node-fs,node-git,codex-sessions}.ts`
- Codex hook 組裝根與用例：`src/presentation/hooks/codex/hook.ts`（`runCodexHookEntry` / `runCodexArchiveHook`）、進入點 `src/presentation/hooks/codex/precompact.ts`
- 歸檔核心：`src/core/application/transcript/{transcript,codex}.ts`（`writeConversationArchive` / `renderCodexTranscript` / `countCodexUserMessages` / `archiveCodexTranscript`）
- init 用例：`src/core/application/bootstrap.ts`；CLI 組裝根 `src/presentation/cli/elgt.ts`
- 依賴規則 CI 強制：`src/architecture.test.ts`
