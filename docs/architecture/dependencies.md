# 依賴規則與依賴圖（Dependencies）

> 這份文件描述 EleGent（`elgt`）程式碼的**允許依賴方向**與其 **CI 強制**機制。
> **Single source of truth 是可執行測試 [`src/architecture.test.ts`](../../src/architecture.test.ts)**——手畫的圖會漂移，測試不會：任何違反下列規則的 `import` 會讓 `bun test` 失敗、build fail。本檔只是把那組斷言畫出來給人看；規則本身以測試為準。

Explicit Architecture 三區塊，依賴一律**向內**指向 Application Core；跨 block 一律走 `@core` / `@presentation` / `@infrastructure` 別名（`tsconfig.json` 的 `paths`，分別對應 `src/core|presentation|infrastructure`）。

## 1. Layer 依賴圖（presentation → core ← infrastructure）

```mermaid
flowchart LR
    Node["node:fs · node:os · Bun.spawn（I/O + 環境知識）"]

    subgraph presentation["presentation — driving / primary adapters（組裝根）"]
        Pcli["cli/ · elgt init-ui reindex lint guard backfill scaffold"]
        Phooks["hooks/ · claude/* codex/* hookio"]
        Pmcp["mcp/ · server.ts"]
    end

    subgraph core["core — Application Core（純，最內層）"]
        Capp["application/ · bootstrap scaffold indexgen lint wake templates transcript/*"]
        Cports["ports.ts · FileStore · GitRunner · CodexSessionLocator"]
        Cdomain["domain/ · frontmatter safety dates noise guard（零外部相依）"]
        Capp --> Cports
        Capp --> Cdomain
    end

    subgraph infrastructure["infrastructure — driven / secondary adapters"]
        Iad["adapters/ · node-fs · node-git · codex-sessions"]
        Ihelp["state（游標/hooks.log） · autodigest"]
    end

    presentation ==>|"依賴向內"| core
    infrastructure ==>|"實作 port，依賴向內"| core
    presentation -.->|"組裝根注入實作(DI)"| infrastructure
    infrastructure ==>|"只在此層碰 I/O"| Node

    core -.->|"✗ 規則1"| presentation
    core -.->|"✗ 規則1"| infrastructure
    infrastructure -.->|"✗ 規則2"| presentation
    core -.->|"✗ 規則3"| Node

    linkStyle 6,7,8,9 stroke:#e5484d,stroke-width:1.5px,color:#e5484d;
    style core fill:#eef7f0,stroke:#0ca678
    style presentation fill:#eef4fb,stroke:#1c7ed6
    style infrastructure fill:#fdeef4,stroke:#e64980
```

**圖例**

- 粗實線 `==>`：允許的向內依賴（`presentation → core`、`infrastructure → core`）。
- 灰虛線 `-.->`：`presentation` 作為**組裝根（composition root）**在執行期把 `infrastructure` 實作注入 `core` 定義的 port（DI）。這是唯一「外層 import 外層」的合法情形——因為 `presentation` 是最外圈，允許 import 任何一層。
- 紅色 `✗`：被 `src/architecture.test.ts` 判為非法、會 build fail 的依賴（編號對應下節三條斷言）。

## 2. CI 強制的三條斷言（`src/architecture.test.ts`）

三條規則各是一個 `bun test`，斷言「違規檔清單為空」（`offenders(block, forbidden)` 掃該 block 生產碼的 `import`，`toEqual([])`）。**測試檔本身排除**（`.test.ts` 是迷你組裝根，允許注入 `infrastructure` adapter 如 `nodeFileStore` 驗真行為）。除了別名，也一併擋相對路徑繞過（`../presentation/` 之類）。

| # | 斷言（test 名稱） | 禁止的依賴 | 為何 |
|---|---|---|---|
| 1 | core 不得依賴 presentation 或 infrastructure（core 是最內層） | `core` ↛ `@presentation/` · `@infrastructure/`（含相對路徑繞過） | 最內層不得認識任何外層——Core 不知道自己被誰驅動、由誰實作 I/O |
| 2 | infrastructure 不得依賴 presentation（secondary adapter 不反向叫 UI） | `infrastructure` ↛ `@presentation/`（含相對路徑繞過） | driven/secondary adapter 不得反向叫 driving/primary（UI） |
| 3 | core 生產碼不得直接碰 fs/spawn/os | `core` 生產碼 ↛ `node:fs` · `node:os` · `Bun.spawn*(` | I/O 與環境（磁碟佈局 / homedir）知識一律經 port，由 infrastructure 注入；`node:path`（純字串運算）允許 |

> 這條規則的由來：當初 `lib/bootstrap` 反向 `import` `cli/scaffold` 那類「內層抄捷徑叫外層」的問題，就是靠這支測試長出防線，改壞立刻紅燈，而不是等 code review 人肉抓。

## 3. Class / type 級規則

- **`core/domain` 零外部相依**：`frontmatter` / `safety` / `dates` / `noise` / `guard` 是純規則與 Value Object，連 `core/application` 都不依賴，更不碰任何 port——最內核。
- **`core` 只依賴 `@core/ports` 介面**：`application` 的用例做 I/O 一律經 `FileStore` / `GitRunner` / `CodexSessionLocator` 這三個 Core-owned port 型別，**不認識任何具體 adapter**（`node-fs` / `node-git` / `codex-sessions`）。具體實作在執行期由 `presentation` 組裝根注入。
- **跨 block 一律走別名**：`@core/*` → `src/core/*`、`@presentation/*` → `src/presentation/*`、`@infrastructure/*` → `src/infrastructure/*`（`tsconfig.json` paths）。別名讓「跨 block import」在原始碼裡是**可被掃描的字面 pattern**，規則 1/2 的測試因此能用一條 regex 精準表達，也順手擋了 `../` 相對路徑繞過。

## 4. Component 級：單一 bounded context

EleGent 整個工具是**單一 bounded context**（個人記憶系統 / vault 工具本身）。內部只有分層（presentation / core / infrastructure）與一個 feature slice（`application/transcript/` 下的 `claude` / `codex` 具名 parser），**沒有第二個獨立領域**，因此**沒有、也不需要** component 級的「跨 context 解耦 / microservice-ready」依賴圖——沒有多個 domain module 要證明彼此解耦。

未來是否該切出新的 bounded context（例如把「歸檔」或「digest 蒸餾」拆成獨立服務），屬於**架構設計裁量**，交給 `explicit-architecture` skill 判斷，不在本記錄文件範圍。

## 5. 為何偏好 generated + CI-enforced（用 `bun test`，而非 deptrac / dependency-cruiser）

本專案刻意用一支自寫的 `bun test`（`src/architecture.test.ts`）表達「允許依賴」規則，而不引入 Deptrac / dependency-cruiser / eslint-boundaries：

- **圖會漂移，程式碼是真相。** 手畫的分層圖只反映「我以為程式碼長怎樣」；把規則寫成掃 `import` 的可執行斷言、跟程式碼放同一 repo、同一測試套件，違規當下就紅燈 fail build，而不是靠 review 抓。這正是本檔開頭把測試列為 single source of truth 的原因——本 markdown 只是可讀的投影。
- **零額外相依、零額外 CI 步驟、零 config drift。** 工具鏈已是 Bun / TypeScript，`bun test` 是既有的一等 runner。三層、幾條規則、單一 binary 的規模，一支 ~50 行、和 domain 測試一起跑的測試，就完整覆蓋 Deptrac 那套「向內依賴」意圖；不必為此多養一個 devDependency、一份設定檔、一條要維護的 lint pipeline。
- **斷言語意直接可讀。** 測試名稱本身就是規則（「core 不得依賴 presentation 或 infrastructure」），regex 直接對應「禁止 import 什麼」，且因為跨 block 走別名，pattern 精準、不易誤傷。
- **Deptrac 是 PHP 生態、dependency-cruiser 是額外圖產生器**——對這個規模而言都是過度投資。等 bounded context 或層數長大到自寫測試難以維護，再評估換工具即可。

---
