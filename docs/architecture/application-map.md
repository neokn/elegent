# Application Map — EleGent 行為地圖

> 把系統當一張地圖：**components 是城市**（core / presentation / infrastructure 的主要模組）、**use cases 是道路**（UC1..UC10，把某個 entry point 接到某些 core 用例、再落到某些 port）、**events 是高速公路**（agent CLI 的 lifecycle 事件 Stop / PreCompact / SessionEnd / SessionStart，觸發整條歸檔 / 喚醒流程）。
> 這張地圖只描述**行為**（誰觸發誰、資料流到哪）；**依賴方向**與其 CI 強制見 [dependencies.md](./dependencies.md)。全部在使用者本機，無網路服務。

## 1. 行為地圖（entry point → 用例 → port / adapter → vault）

```mermaid
flowchart LR
    subgraph EV["events（高速公路）— agent CLI lifecycle"]
        E_stop["Stop"]
        E_pre["PreCompact"]
        E_end["SessionEnd"]
        E_start["SessionStart"]
        E_post["PostInvocation<br/>（Antigravity）"]
    end

    subgraph EP["entry points（driving adapters）"]
        EP_ch["Claude hooks · stop/precompact/sessionend/sessionstart"]
        EP_cx["Codex hooks · stop/precompact"]
        EP_ag["Antigravity hooks · postinvocation"]
        EP_cli["elgt CLI · init/reindex/lint/guard/backfill"]
        EP_mcp["elegent-memory MCP · list/search/read/wake（常駐；Claude/Codex 常駐，Antigravity 僅 user scope）"]
    end

    subgraph UC["use cases（道路）— core/application"]
        UC1["UC1 init · bootstrap+scaffold+config-merge+vault-naming"]
        UC2["UC2 對話歸檔 · archiveClaude/Codex/AgyTranscript"]
        UC3["UC3 SessionEnd · 歸檔+reindex+清游標+autodigest"]
        UC4["UC4 SessionStart · buildWakeBundle"]
        UC5["UC5 memory · list/search/read/wake"]
        UC6["UC6 reindex · regenerateIndexes"]
        UC7["UC7 lint · lintVault+checkRawImmutable"]
        UC8["UC8 guard · checkAugmentation"]
        UC9["UC9 backfill · 回填歷史 session"]
        UC10["UC10 digest（工具外 /digest skill）"]
    end

    subgraph PT["ports（core-owned）"]
        PT_fs["FileStore"]
        PT_git["GitRunner"]
        PT_loc["CodexSessionLocator"]
        PT_mcp["McpRegistrar"]
    end

    subgraph AD["driven adapters + helpers（infrastructure）"]
        AD_fs["node-fs"]
        AD_git["node-git"]
        AD_cx["codex-sessions"]
        AD_cli["agent-cli（claude/codex mcp add）"]
        AD_st["state（游標/hooks.log）"]
        AD_dg["autodigest（spawn claude -p /digest）"]
    end

    subgraph VS["vault + 本機儲存"]
        V_raw["vault/palace/raw/conversations/&lt;slug&gt;/&lt;date&gt;_&lt;sid&gt;.md"]
        V_idx["index.md（生成物）"]
        V_wake["palace/wake"]
        V_para["PARA · projects/areas/resources/archives"]
        S_cx["~/.codex/sessions"]
        S_state[".elegent-state"]
        G_repo["git repo"]
    end

    E_stop --> EP_ch
    E_stop --> EP_cx
    E_pre --> EP_ch
    E_pre --> EP_cx
    E_end --> EP_ch
    E_start --> EP_ch
    E_post --> EP_ag

    EP_cli --> UC1
    EP_cli --> UC6
    EP_cli --> UC7
    EP_cli --> UC8
    EP_cli --> UC9
    EP_ch --> UC2
    EP_ch --> UC3
    EP_ch --> UC4
    EP_cx --> UC2
    EP_ag --> UC2
    EP_mcp --> UC5

    UC1 --> PT_fs
    UC1 --> PT_git
    UC1 --> PT_mcp
    UC2 --> PT_fs
    UC2 --> PT_loc
    UC3 --> PT_fs
    UC4 --> PT_fs
    UC5 --> PT_fs
    UC6 --> PT_fs
    UC7 --> PT_fs
    UC7 --> PT_git
    UC9 --> PT_fs

    UC2 --> AD_st
    UC3 --> AD_st
    UC3 --> AD_dg

    PT_fs --> AD_fs
    PT_git --> AD_git
    PT_loc --> AD_cx
    PT_mcp --> AD_cli

    AD_fs --> V_raw
    AD_fs --> V_idx
    AD_fs --> V_wake
    AD_fs --> V_para
    AD_git --> G_repo
    AD_cx --> S_cx
    AD_st --> S_state
    UC8 -.->|"direct readFileSync + git show"| G_repo

    AD_dg -.->|"spawn /digest"| UC10
    UC10 -.-> V_para
    UC10 -.-> V_wake

    classDef event fill:#fff3bf,stroke:#f08c00,color:#5c3c00;
    classDef entry fill:#e7f5ff,stroke:#1c7ed6,color:#0b3d66;
    classDef uc fill:#f3f0ff,stroke:#7048e8,color:#3b2560;
    classDef port fill:#e6fcf5,stroke:#0ca678,color:#0b4a3a;
    classDef adapter fill:#fff0f6,stroke:#e64980,color:#6b2140;
    classDef store fill:#f1f3f5,stroke:#868e96,color:#2b2b2b;

    class E_stop,E_pre,E_end,E_start,E_post event;
    class EP_ch,EP_cx,EP_ag,EP_cli,EP_mcp entry;
    class UC1,UC2,UC3,UC4,UC5,UC6,UC7,UC8,UC9,UC10 uc;
    class PT_fs,PT_git,PT_loc,PT_mcp port;
    class AD_fs,AD_git,AD_cx,AD_cli,AD_st,AD_dg adapter;
    class V_raw,V_idx,V_wake,V_para,S_cx,S_state,G_repo store;
```

**讀圖**：由左而右一路 `event（高速公路）→ entry point → use case（道路）→ port → adapter → vault`。實線＝主流程；灰虛線＝ `autodigest` 在 SessionEnd 後**非同步**回頭 spawn 的 `/digest`（工具外 skill，故 UC10 無 port）。箭頭表「觸碰/流向」，讀寫之別見下方對照表（例如 UC4 是**讀** `wake`，UC2/UC3 是**寫** `raw`）。

## 2. 城市 × 道路 × 高速公路對照表（UC1..UC10）

| UC（道路） | 觸發（高速公路 / 手動） | entry point（driving adapter） | core 用例（城市：application/domain） | ports 用到 | adapters / helpers | vault 產物 / 儲存 |
|---|---|---|---|---|---|---|
| **UC1** init | 手動 `elgt init` | `cli/elgt` | `bootstrap` → `scaffold`、`regenerateIndexes`、`renderTemplate`（digest skill）、`mergeClaudeSettings`/`mergeCodexHooks`/`mergeAgyHooks`（config-merge，冪等合併 hooks）、`vaultDirName`/`resolveVaultDir`（vault-naming，local/project 依 basename 強制命名）、`renderCodexMcpToml` | FileStore, GitRunner, McpRegistrar | node-fs, node-git, agent-cli（`claude`/`codex mcp add`） | 建 vault 骨架 + digest skill + hooks 設定（依 scope 落 `.claude/settings(.local).json`／`.codex/hooks.json`／`.agents/hooks.json` 或對應 user dir）+ `index.md`；**不再**產生 `CLAUDE.md`/`AGENTS.md`/`.mcp.json`；MCP 依 scope 走 `claude`/`codex mcp add` 或直寫 `.codex/config.toml`／`mcp_config.json`（agy 僅 user scope）；非 git repo 則 init+commit |
| **UC2** 對話歸檔 | **Stop / PreCompact / PostInvocation** | `hooks/claude/{stop,precompact}`、`hooks/codex/{stop,precompact}`、`hooks/agy/hook`（postinvocation/stop） | `render{Claude,Codex,Agy}Transcript` → `count*UserMessages` → `writeConversationArchive` | FileStore（Codex 另用 CodexSessionLocator 掃 sessions） | node-fs, codex-sessions, state（游標） | 寫 `palace/raw/conversations/<slug>/<date>_<sid>.md`；推進 `.elegent-state` 游標。Claude Stop 門檻是每有 1 則新使用者訊息就寫（`SAVE_INTERVAL=1`，見 `src/infrastructure/state.ts`）且不 reindex；Claude PreCompact 無節流、不 reindex；Codex Stop 只在 `count<=lastSave` 時略過，Codex PreCompact 無節流，兩者寫檔成功都會 reindex；Antigravity postinvocation/stop 目前行為相同，皆用訊息數節流 |
| **UC3** SessionEnd | **SessionEnd** | `hooks/claude/sessionend` | 歸檔（同 UC2）+ `regenerateIndexes`；清游標；觸發 autodigest | FileStore | node-fs, state（清游標）, autodigest | 補寫 raw + 重生 `index.md`；spawn `/digest`（→ UC10） |
| **UC4** SessionStart | **SessionStart** | `hooks/claude/sessionstart` | `buildWakeBundle`（wake） | FileStore | node-fs | **讀** `palace/wake/identity.md` + `palace/wake/essential-story.md`，注入 additionalContext（memory-wake），不寫 |
| **UC5** MCP 記憶 | agent 隨呼隨用（常駐，非事件） | `mcp/server.ts` | `resolveVaultRoots`（主 vault + 自動探測 `{slug}.vault`/`.{slug}.vault`）→ `listDirs/searchVaults/readFromVaults/wakeVaults` 跨所有 root 查詢，結果以 `[vault 標籤]` 標註來源；`memory_wake` 底層仍呼叫 `buildWakeBundle`（core），其餘三個工具直接在 presentation 以 `node:fs` 實作 | FileStore（僅 `memory_wake` 經 `buildWakeBundle`） | node-fs（wake）、presentation `node:fs` helpers（list/search/read，跨 root） | **唯讀**查詢一個或多個 vault（全域 + 專案內嵌） |
| **UC6** reindex | 手動 `elgt reindex` | `cli/reindex` | `regenerateIndexes`（indexgen） | FileStore | node-fs | 重生 `index.md`（生成物） |
| **UC7** lint | 手動 `elgt lint` | `cli/lint` | `lintVault` + `checkRawImmutable` | FileStore, GitRunner | node-fs, node-git | **唯讀**檢查：frontmatter/type/斷鏈/fact 區間 + `palace/raw` append-only（經 git diff） |
| **UC8** guard | 手動 `elgt guard <file>` | `cli/guard` | `checkAugmentation`（domain/guard，純規則） | 無（presentation 直接 `readFileSync` + `Bun.spawnSync(["git", ...])`） | 無 port adapter；直接讀檔與呼叫 git | **唯讀**單檔檢查任意既有檔案是否刪除 heading、減少 Citations，或修改 `user_managed: true` 檔 |
| **UC9** backfill | 手動 `elgt backfill [projectsDir]` | `cli/backfill` | `archiveClaudeTranscript` 回填（application/transcript/claude） | FileStore | node-fs | 補寫 Claude `palace/raw/conversations` 歷史檔；目前不支援 Codex 回填 |
| **UC10** digest | autodigest 於 SessionEnd 後 spawn（工具外） | `claude -p /digest` 子行程（非 elgt） | 無（由 `/digest` skill 執行，工具邊界外） | 無 | autodigest（spawn + lockfile） | **讀** `palace/raw` → **蒸餾寫入** PARA + `palace/wake` |

## 3. 高速公路（events）→ 觸發流程

| event（高速公路） | 觸發 | 說明 |
|---|---|---|
| **Stop** | UC2 對話歸檔 | Claude 從 stdin 拿 `session_id`+`transcript_path`，門檻是每有 1 則新使用者訊息就寫（`SAVE_INTERVAL=1`）且不 reindex；Codex 用 CodexSessionLocator 掃 `~/.codex/sessions`，只有完全沒有新訊息（`count<=lastSave`）才略過，寫檔成功會 reindex |
| **PreCompact** | UC2 對話歸檔 | Claude/Codex 都無節流、壓縮前保存逐字稿；Codex 寫檔成功會 reindex，Claude 不會 |
| **SessionEnd** | UC3（→ 觸發 UC10） | Claude 專用：歸檔 + `regenerateIndexes` + 清游標 + spawn `/digest`（autodigest） |
| **SessionStart** | UC4 | 注入 wake bundle（memory-wake）到 additionalContext |
| **PostInvocation** | UC2 對話歸檔 | Antigravity 專用：每次呼叫後觸發，用訊息數節流（同 Codex Stop 語意）；`stop` 型別已留但目前與 postinvocation 行為相同，且沒有任何設定會實際觸發它 |

> `elgt` 子指令（init / reindex / lint / guard / backfill）是**手動出入口**、非事件驅動；**MCP** 是 Claude/Codex 的**常駐** stdio 子行程（隨呼隨用查詢記憶），Antigravity 沒有對應 CLI，僅 user scope 會把設定直接合併進 `mcp_config.json`——三者都不掛在 lifecycle 高速公路上。
