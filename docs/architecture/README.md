# EleGent 架構文件

EleGent（`elgt`）架構的完整文件 dossier。**這個 repo 是「產生 vault 的工具原始碼」，不是活的 vault。**
決策的「為什麼」在 [Architecture Decision Log](../adr/)；本目錄是結構、視圖與依賴規則的靜態/行為描述。

一句話定位：EleGent 在使用者資料夾建立**雙受眾 markdown vault**（PARA 給人、記憶宮殿給 LLM），
並整合各家 agent CLI 的 lifecycle hooks + MCP，自動把對話逐字稿歸檔進 vault、對外供記憶查詢。
程式碼採 **Explicit Architecture**（Core / Presentation / Infrastructure，依賴一律向內，CI 強制）。

## 想找什麼，看哪一份

| 你的問題 / 受眾 | 文件 |
|---|---|
| **為什麼這樣決定？**（未來維護者、reviewer） | [Architecture Decision Log（ADR）](../adr/) |
| 這是什麼、跟誰互動、有哪些可執行單元？（含 C4 Context/Container/Component/Code） | [c4.md](./c4.md) |
| 多受眾的多視圖（領域 / 模組分層 / 執行期 / 部署 / 場景） | [4plus1.md](./4plus1.md) |
| 單一互動 / 模式 / 生命週期（Ports&Adapters class、Stop-hook sequence、記憶生命週期 state、init activity） | [uml.md](./uml.md) |
| 允許的依賴方向與其 **CI 強制** | [dependencies.md](./dependencies.md) |
| 行為地圖：entry point → 用例 → port/adapter → vault | [application-map.md](./application-map.md) |

## Dossier 對照（Graça「Documenting Software Architecture」）

| # | Artifact | 位置 |
|---|---|---|
| 1–4 | C4 Context / Container / Component / Code | [c4.md](./c4.md) |
| 5–9 | 4+1 Logical / Development / Process / Physical / Scenarios | [4plus1.md](./4plus1.md) |
| 10–13 | UML pattern class / sequence / state / activity | [uml.md](./uml.md) |
| 14–15 | ASR + ADR + ADL（決策紀錄） | [../adr/](../adr/)（含 ASR 清單） |
| 16–18 | 依賴圖 layer / class / component **+ CI 強制** | [dependencies.md](./dependencies.md) · 規則真相在 [`src/architecture.test.ts`](../../src/architecture.test.ts) |
| 19 | Application Map | [application-map.md](./application-map.md) |
| 20 | 索引（本檔） | 你正在看 |

**N/A（單一 CLI 工具刻意不做）：** 無獨立的重量級部署拓撲（一切在本機，見 4plus1 的 Physical view）；
無跨 bounded-context 的 component 解耦圖（單一 context，見 dependencies.md §4）；per-tool/per-vendor 與
`Component/<Context>/`、`SharedKernel/` 等 EA 子命名空間（見 [ADR-0006](../adr/0006-ea-depth-tuned-to-single-bounded-context.md)）。

## 維護原則

- **依賴/結構規則以程式碼為真相，不靠手畫圖。** 允許依賴由 [`src/architecture.test.ts`](../../src/architecture.test.ts)
  以 `bun test` 強制，違反即 build fail；本目錄的圖是它的可讀投影，改架構時一併更新。
- **ADR 不可編輯、只可 supersede**——見 [../adr/README.md](../adr/README.md)。
- 圖用 Mermaid（GitHub / Obsidian 直接渲染），與程式碼同 repo，改碼時順手更新。
- 使用者說明書（給 `elgt` 使用者、非開發文件）在 [../manual/](../manual/)。
