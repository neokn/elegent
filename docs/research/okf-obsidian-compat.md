# OKF × Obsidian 雙相容性分析 與 knowledge-catalog 採用清單

---

## Part 1：OKF × Obsidian 雙相容性分析

### 1.0 結論先講

**雙相容可行，且不是勉強的折衷——但前提是接受一個關鍵取捨：內部連結放棄 wikilink `[[...]]`，改用標準 markdown 相對連結。** 這是唯一真正的「二選一」。其餘衝突（frontmatter、tag、命名、時間戳、保留檔名）都有無損或近乎無損的收斂方案。

理由：OKF conformance（§9）其實只硬性要求三件事——(1) 每個非保留 `.md` 有可解析的 YAML frontmatter、(2) frontmatter 有非空 `type`、(3) index.md/log.md 若存在則遵循 §6/§7。Obsidian 對這三件事全部無異議（Obsidian 不要求 frontmatter，但也不排斥）。反過來，Obsidian 專屬語法（wikilink/embed/callout/block-id）在 OKF 眼中多數只是「body 裡的自由 markdown」，不會導致 non-conformant——只是 OKF consumer 抽不出連結圖。所以嚴格說：**用 wikilink 也不違反 OKF conformance，但會讓 OKF 的 link graph 層完全失效**（OKF viewer/consumer 的正則只認 `](xxx.md)`）。要「有意義的雙相容」（兩邊都能建圖），就必須用標準 markdown 連結。

幸運的是 Obsidian 對標準 markdown 連結是一等公民支援：可解析、可點擊、改名自動更新、支援 `#heading` 與 `#^block-id` 錨點、進 graph view 與 backlinks。只要在 Obsidian 設定關掉 wikilink 生成，兩個世界就重合了。

### 1.1 天然相容區（不需要任何處理）

| 面向 | 為何天然相容 |
|---|---|
| 檔案格式 | 兩邊都是「YAML frontmatter + markdown body」的 UTF-8 `.md`。OKF 的 Documents Layout 與 Obsidian 筆記格式逐 byte 相同。 |
| frontmatter 擴充欄位 | OKF 規定 consumer 必須保留未知 key 且不得 reject（SPEC §4.1）；Obsidian 把未知 property 當 Text/List 顯示。雙方都寬容，`aliases`、`cssclasses`、`user_managed`、`source` 等欄位互不干擾。 |
| `tags` | 兩邊都要 YAML list of 短字串、都不帶 `#`。OKF 不規定字元集，Obsidian 的規則（不以數字開頭、允許 `/` 巢狀、`-`、`_`）是子集——照 Obsidian 規則寫即同時滿足兩邊。 |
| 標準 markdown 連結 + 錨點 | OKF §5 用 `[text](path.md)`；Obsidian 原生支援同語法，且支援 `note.md#Heading`、`note.md#^block-id` 錨點形式，改名/移動自動更新路徑。 |
| callout `> [!note]` | 建構在 blockquote 上，OKF consumer 看到的是合法 markdown 引言區塊，優雅降級。可放心在 body 使用。 |
| body 內的表格（temporal fact table） | 對兩邊都只是 GFM 表格。MemPalace 的時間性事實表無需改動。 |
| backlinks | 兩邊都是「只存正向連結、反向即時反算」：Obsidian 內建 + `obsidian-cli backlinks`；OKF viewer 從 link graph 反推 Cited-by。零額外維護。 |
| index.md / log.md 檔案本身 | Obsidian 對這兩個檔名沒有任何特殊語意，OKF 的保留檔名規則可以原樣落地。 |
| 目錄樹 = PARA | OKF 明言目錄結構由 producer 自訂、與領域無關（§3）；PARA 四資料夾 + `palace/` 就是一個合法的 bundle layout，整個 vault 即一個 OKF bundle（散布形式 (a)：git repo）。 |

### 1.2 衝突點與具體解法

#### 衝突 A：連結語法（唯一的硬取捨）

- **衝突**：Obsidian 預設生成 `[[wikilink]]`（以筆記名解析）；OKF 只認 `[text](path.md)`（以路徑解析），OKF viewer 正則 `\]\(([^)\s]+\.md)` 抽不到 wikilink。
- **解法（採 OKF 形式，Obsidian 配合）**：
  1. 全 vault 規定內部連結一律 `[顯示文字](relative/path.md)`，相對路徑形式（OKF §5.2 合法；**不用** SPEC 推薦的 `/` 開頭形式——OKF 自己的 reference agent 也禁止 leading `/`，因為會弄壞 GitHub/Obsidian 渲染。這裡 OKF 的實作已經替你做了選擇）。
  2. Obsidian 設定：Files & Links → 關閉「Use [[Wikilinks]]」、New link format 設「Relative path to file」、開啟「Automatically update internal links」。之後在 Obsidian 內手動建立連結也會自動生成雙相容格式。
  3. 細粒度定址保留：`[出處](../palace/entities/justin.md#^fact-2026-07-06a)` 在 Obsidian 內完全可點可跳；OKF consumer 把它當普通連結（錨點忽略）。block-id `^id` 定義行在外部渲染器會外露一小段文字——這是可接受的視覺代價。
- **付出的代價（誠實揭露）**：(a) 失去 `[[` 自動補全的輸入體驗（部分可用 aliases + quick switcher 補回）；(b) 失去 embed/transclusion `![[...]]`（見衝突 F）；(c) 連結顯示文字要自己寫（但這反而是 OKF 要的——顯示文字承載語意）。

#### 衝突 B：frontmatter 保留欄位與型別

- **衝突**：Obsidian 對 `tags`/`aliases`/`cssclasses` 有保留語義；Links 型 property 只認加引號的 wikilink（`related: "[[Note]]"`），與「無 wikilink」原則打架。
- **解法**：
  - `tags`/`aliases` 照 Obsidian 語義用——對 OKF 而言 `tags` 正好是規範欄位、`aliases` 是合法擴充 key，雙贏。
  - **關係連結一律放 body、不放 frontmatter**。在 body 固定一個 `## Links`（或 `## Related`）heading 放 markdown 連結清單。理由：OKF 的建圖只掃 body；Obsidian 的 graph/backlinks 也吃 body 連結；frontmatter Links 型是兩邊唯一無法調和的點，直接繞開。
  - 自有欄位避開 Obsidian 保留名，用不重疊命名（`source`、`user_managed`、`para`、`confidence`），全部是 OKF 合法擴充 key。

#### 衝突 C：檔名/識別（名稱鍵 vs 路徑鍵）

- **衝突**：Obsidian（與 obsidian-cli 的 `file=`）以「筆記名」為主鍵、愛空格人類可讀名；OKF 慣例是小寫底線 slug、concept ID = 路徑。
- **解法（slug 檔名 + title/aliases 補人味）**：
  1. 檔名一律 slug：小寫、`-` 或 `_`、無空格、**全 vault 唯一**（例 `justin-work-preferences.md`）。唯一性同時滿足 obsidian-cli `file=` 解析與避免歧義。
  2. 人類可讀性由 frontmatter `title`（OKF 建議欄位）與 `aliases`（Obsidian quick switcher/連結建議）承載。
  3. 連結顯示文字用 title：`[Justin 的工作偏好](../palace/entities/justin-work-preferences.md)`。
  4. slug 無空格的副作用是好的：markdown 連結不需 URL-encode。
  5. **例外**：`index.md`、`log.md` 天生大量重名，obsidian-cli 操作它們時一律用 `path=` 而非 `file=`。

#### 衝突 D：時間戳型別

- **衝突**：OKF `timestamp` 用完整 ISO 8601 含時區偏移（實檔 `'2026-05-28T22:43:59+00:00'`）；Obsidian 的 Date & Time property 型別偏好 `YYYY-MM-DDTHH:mm:ss`（無偏移），帶偏移時可能降級為純文字顯示。
- **解法**：`timestamp` 保留完整 ISO 8601 含偏移（機器真相，OKF 對齊），接受它在 Obsidian property UI 中以文字呈現；若需要 Obsidian 可排序/可過濾的日期，**另加** `date: YYYY-MM-DD`（Obsidian Date 型，且與 log.md 的 `## YYYY-MM-DD` 標題同格式）。這是冗餘一欄換兩邊都原生的划算交易。

#### 衝突 E：「每個 .md 都要 frontmatter + type」 vs 人在 Obsidian 隨手建檔

- **衝突**：OKF conformance 要求每個非保留 `.md` 有 frontmatter 且 `type` 非空；人類在 PARA 資料夾隨手 Cmd+N 的筆記不會有。這是雙相容日常維運中最容易破的點。
- **解法（三道防線）**：
  1. Obsidian 模板 + `obsidian-cli create name=... template=...` 強制新檔套統一 frontmatter。
  2. Claude Code hooks 歸檔對話時由 hook 注入完整 frontmatter（type/title/description/tags/timestamp）。
  3. Lint 分兩級（照抄 OKF §9 哲學）：**硬錯誤** = frontmatter 不可解析、缺 `type`（自動修復 job 補 `type: note`）；**軟提醒** = 缺 description、斷鏈、缺 index 條目。斷鏈只警告不禁止——OKF 明文容忍，且「指向尚未寫的知識」對記憶宮殿是 feature。

#### 衝突 F：Obsidian 專屬語法的分級使用

- **衝突**：embed `![[...]]`、comment `%%...%%`、`==highlight==` 在 OKF/外部渲染器不解析（embed 外露、comment 洩漏）。
- **解法（三級白名單）**：
  - **綠（隨意用）**：callout、GFM 表格、footnote、mermaid——都優雅降級。
  - **黃（限定場域）**：block-id `^id`（只在 palace/entities 事實表用，當穩定引用把手，接受行尾外露）；`%%comment%%` 禁用於會被外部消費的檔案（會洩漏內部註記），只允許在 `palace/` 內部檔案。
  - **紅（禁用）**：`![[embed]]`/transclusion、`[[wikilink]]`。DRY 需求改用「連結 + 一句摘要」而非內嵌——這與 OKF index.md 的條目哲學一致。

#### 衝突 G：index.md 的 frontmatter 禁令 vs closet pointer 格式（與既有 MemPalace 移植的直接衝突）

- **衝突**：OKF 規定 index.md **不得有 frontmatter**（唯一例外：root index.md 可放 `okf_version`），且 body 格式固定為 `# 分組` + `* [Title](link) - description`。你先前從 MemPalace 偷的 closet pointer 索引行格式若寫進 `palace/index.md`，就會讓保留檔案 non-conformant。
- **解法（拆成兩個檔）**：
  - `palace/index.md`：嚴格 OKF §6 格式，可自動重生（描述取自各檔 frontmatter 的 description），當「這層有什麼」的目錄。
  - closet pointer 語意搬到 `palace/map.md`（一般 concept，`type: moc`）：非保留檔名，body 想寫什麼格式都行，pointer 行格式原樣保留。wake 流程改為讀 `map.md`。
  - root `index.md` frontmatter 放 `okf_version: "0.1"`，正式宣告 vault 是 OKF bundle。

### 1.3 建議的雙相容 Profile（可直接寫進 vault 規範）

**Frontmatter 模板**（所有非保留 `.md`）：

```yaml
---
type: entity                    # OKF 唯一必填。封閉詞彙表，見下
title: Justin 的工作偏好          # OKF 建議欄位 = Obsidian 顯示標題
description: Justin 在工具選擇與開發流程上的長期偏好事實表。  # 一句話，會被逐字複製進 index.md
tags:                           # block list、無 #、kebab-case、/ 巢狀、不以數字開頭
  - palace/entity
  - person
timestamp: 2026-07-06T14:30:00+08:00   # OKF：完整 ISO 8601 含偏移
date: 2026-07-06                # Obsidian Date 型，供排序過濾（選填冗餘）
aliases:                        # Obsidian 保留欄位 = OKF 合法擴充
  - Justin 偏好
source: "claude-session:2026-07-06"    # 擴充欄位：provenance
user_managed: false             # 擴充欄位：false = LLM 可重寫；true = 只讀
---
```

**`type` 封閉詞彙表**（type = 文件種類，不是 PARA 位置；位置由資料夾承載，檔案搬家 type 不變）：`note`｜`moc`｜`entity`｜`raw-log`｜`wake`｜`daily`。禁止 LLM 發明新 type（lint 檢查）。

**連結**：內部一律 `[Title](relative/path.md)`（可帶 `#heading`/`#^block` 錨點）；外部 URL 用 `[text](url)`；關係放 body 的 `## Links` 段；斷鏈允許、lint 軟提醒。

**命名**：檔名 = 唯一 slug（小寫、`-`）；人味靠 `title` + `aliases`；`index.md`/`log.md` 保留、CLI 用 `path=` 定位。

**Obsidian 設定**：關閉 Use [[Wikilinks]]、連結格式 = relative path、自動更新內部連結 = on。

**log.md**：`## YYYY-MM-DD`（newest first）+ `* **Update**: ...` 條目，OKF §7 原樣。

### 1.4 根本限制（誠實聲明）

1. **wikilink 生態的部分放棄是真實成本**：`[[` 補全、`![[]]` transclusion、Obsidian 部分社群 plugin 假設 wikilink。若未來反悔，wikilink → markdown link 有無損轉換器可走，反向（md link → wikilink）也可，所以這不是不可逆決定，但同一時間只能有一個 canonical 形式。
2. **obsidian-cli 的 `property:set` 會重寫 YAML**（正規化鍵序）：不違反 OKF conformance（spec 不管鍵序），但會產生 diff 噪音，與 OKF 參考實作的偏好鍵序（type/resource/title/description/tags/timestamp）不一致。對策：lint 的自動修復階段統一重排一次鍵序，把噪音收斂。
3. **obsidian-cli 依賴 Obsidian 前景執行**：headless 場景（CI、排程 lint、hooks 在 app 沒開時觸發）必須有純檔案系統 fallback。因為格式是雙相容純文字，fallback 就是直接讀寫檔——這正是選這條路的回報。
4. **index.md 自動重生 vs Obsidian 同步編輯的競態**：重生 job 與人在 Obsidian 手改 index.md 可能互踩。對策：宣告 index.md 為「生成物、手改會被覆蓋」，人要改導覽去改 map.md 或各檔 description。

---

## Part 2：knowledge-catalog 設計採用清單

標記：✅ 採用｜🔶 部分採用/改造｜❌ 捨棄。「MemPalace 註記」欄標明與既有移植（closet pointer、L0-L1 wake、hooks 骨架、temporal fact table）的重複或衝突。

### 格式與結構層

| # | 設計 | 決定 | 理由 / MemPalace 註記 |
|---|---|---|---|
| 1 | mdcode Documents Layout（單一 .md：frontmatter 結構化 + body prose） | ✅ | 與 Part 1 的 profile 完全同構，等於三個獨立來源（OKF、mdcode、Obsidian）都收斂到同一格式，是強背書。無衝突。 |
| 2 | `userManaged` 旗標（人 pin 住 vs agent 可重寫） | ✅ | 直接解決 wake 層問題：`identity.md`/`essential-story.md` 標 `user_managed: true`，LLM 只讀；entities/summaries 標 false 可重寫。**與 MemPalace L0-L1 wake 分層互補**——L0/L1 管載入順序，user_managed 管寫入權限，兩軸正交。 |
| 3 | 固定 heading 當「LLM 可尋址的記憶槽位」（## Overview / ## Links / ## Citations） | ✅ | 讓 LLM 精準更新某段而非整檔重寫。**與 temporal fact table 相容**：entities 檔規範為 `## Facts`（表格）+ `## Links` + `## Citations` 固定槽位。 |
| 4 | 分層 aspect：硬事實層（唯讀）vs AI 敘述層（可再生） | ✅ | 直接映射既有設計：`palace/raw/`（逐字層）= 唯讀 append-only，entities/摘要 = 可由 raw 重新生成。**強化而非新增**——把「raw 不可改寫」升格為 lint 硬規則。 |
| 5 | tool state 與內容分離（`.catalog.state` 不污染內容檔） | 🔶 | 不需要 checksum 衝突偵測（無第二真相來源），但 hooks 需要「哪些對話已歸檔」的游標——放 `.palace-state/`（gitignore 或獨立追蹤），不寫進任何 .md。 |
| 6 | mdcode pull/push 雙向同步、catalog.yaml manifest、conflict handling | ❌ | 整個 sync 半邊是為對接 Dataplex 服務而生；純 markdown vault 檔案即唯一真相，背這套是純負擔。root index.md 的 `okf_version` 已足夠當 manifest。 |

### 寫入/維護層（enrichment patterns）

| # | 設計 | 決定 | 理由 / MemPalace 註記 |
|---|---|---|---|
| 7 | 寫入契約四規則：read-before-write、只合併 net-new 且保留既有、沒新資訊就跳過不寫、寫前自我複審 | ✅ | LLM 維護記憶的核心防線（防破壞性覆寫、防無意義 churn）。寫進 knowledge-vault skill 的 SOP。**與 hooks 骨架相容**：hook 觸發的歸檔 agent 照此四步走。 |
| 8 | augmentation guard（機械式不變量檢查：既有 heading 不可消失、citations 只增不減） | ✅ | 與 #7 互補：#7 是 prompt 契約（勸），guard 是工具層強制（擋）。一般化觸發條件：對所有 `user_managed: false` 既有檔檢查「heading 集合不縮小、Citations 條目數不減」，違反回傳結構化 error 讓 LLM 修正。 |
| 9 | 單一結構化寫入口（agent 只能呼叫 write tool，不得散文結尾/直接 edit） | ✅ | 落地為薄 wrapper script（或約定只用 `obsidian-cli create/append/property:set`），在入口掛 frontmatter schema 驗證 + #8 guard + provenance 記錄。 |
| 10 | per-entry 乾淨 context 的 ephemeral agent 迴圈 | ✅ | 批次維護（重新 enrich 所有 entities、全 vault lint 修復）時逐檔起獨立 subagent，避免 context 污染、可重跑可並行。日常 hook 歸檔不需要。 |
| 11 | download → enrich → review（git diff）→ publish 四段 human-in-the-loop | 🔶 | **分級採用**：日常 hook 追加（append-only 到 raw/log）直接寫，走 git commit 即可回滾；**批次重寫**（LLM 重構 entities、改 user 可見內容）必須走 branch + `git diff` 人審再 merge。全部走四段太重，全部直寫太險。 |
| 12 | 記憶品質 rubric 明文化（compact、不重複既有、禁臆測、禁 may/likely 模糊語、必附 citations、synthesize 不逐字複製） | ✅ | 直接抄進寫入契約。「每則記憶帶 `## Citations`（來源=對話日期/URL/raw 檔連結）」與 `source` frontmatter 欄位配套，解決記憶可信度與膨脹兩大風險。 |
| 13 | index 自動重生演算法（bottom-up、每層只揭露一層、description 逐字上提、單子項複用免 LLM） | ✅ | 照抄：hook 或排程 job 重生各層 index.md。目錄摘要**只用確定性 fallback**（單子項複用 + 「Contains N entries: ...」），不引入 LLM 合成呼叫。**衝突已解**：見 Part 1 衝突 G——closet pointer 移居 map.md，index.md 讓給此演算法。 |
| 14 | 受控爬蟲（預算/邊界硬編在 tool 內、depth 只認種子可達連結） | 🔶 | 僅當「ingest URL」用例啟用時採用其原則（限制放工具層不靠 LLM 自律）；目前 Claude Code 的 WebFetch 已有部分護欄，先不自建爬蟲。 |

### 檢索層（discovery patterns）

| # | 設計 | 決定 | 理由 / MemPalace 註記 |
|---|---|---|---|
| 15 | list / search / read 三件套 + 「先 search 後 read」策略 | ✅ | 無向量檢索前提下的最小可用檢索介面，與 obsidian-cli（`search`）+ grep 直接對應。寫進 skill 的檢索 SOP：search 回 file:line 定位 → read 精讀，禁止全列全讀。 |
| 16 | query decomposition + scatter-gather + dedup + rerank（LLM 當 query planner） | ✅ | **對無向量系統特別關鍵**：單次 grep 命中率低，拆成「原句 + 同義詞 + 領域術語 + 上位概念」多路 grep 再由 LLM 去重重排，是純文字檢索的召回率解法。純 prompt 層，零基建成本。 |
| 17 | SKILL.md 結構範本（frontmatter 路由 + persona 行為偏誤 + 編號 SOP + 封閉詞彙表 + few-shot） | ✅ | 用來重寫/強化既有 knowledge-vault skill。封閉詞彙表段落放 `type` 表與 tag 命名空間表，禁止 LLM 發明分類。注意其反面教材（重複 Step 編號、表格斷行）——長指令要定期 lint。 |
| 18 | Prompt-as-file（agent.md frontmatter 驅動 model/thinking 設定） | 🔶 | Claude Code 的 skill/agent 格式已內建同機制，不需自建 parser。採其精神：記憶策略/歸檔規則都寫成 .md（人可讀、機器可路由），不寫死在 hook script 裡。 |
| 19 | 可插拔 context sources（instructions.md 使用者策略注入 + mcp.json + skills/） | 🔶 | 採「核心不可變 + 使用者注入層」分層：vault 規範（本文件的 profile）是核心；使用者偏好（分類慣例、優先來源）放獨立 `palace/instructions.md` 供 skill 讀取。MCP 接口暫緩（見 #21）。 |
| 20 | 語意檢索 API / embedding 層 | ❌ | 使用者明確無向量檢索；#15+#16 的 agentic grep 檢索是刻意選擇的替代。留紀錄：若 vault 破數千檔再評估。 |

### 消費/基礎設施層

| # | 設計 | 決定 | 理由 / MemPalace 註記 |
|---|---|---|---|
| 21 | 不做 MCP server / 不做服務層（CLI + 檔案即介面） | ✅（採其「不做」） | 與 OKF 同判斷：bundle 就是檔案，人用 Obsidian、LLM 用 obsidian-cli/grep。若未來多 client 共用記憶才把 read/list/write 三件套包成 MCP——介面形狀現在就照三件套設計，屆時平移。 |
| 22 | viz.html 自包含圖譜 | ❌ | Obsidian graph view 已覆蓋（標準 markdown 連結進 graph 無礙）。若要分享記憶快照再說；且其抽連結正則恰好只認標準 md link——我們的連結選型讓這條路保持敞開。 |
| 23 | 兩級 conformance lint（硬錯誤 vs 軟提醒、consumer 極寬容） | ✅ | vault health check 的骨架：硬 = frontmatter 不可解析/缺 type/raw 層被改寫/user_managed 檔被 LLM 動過；軟 = 缺 description、斷鏈、index 過期、鍵序凌亂。與 Part 1 衝突 E 的三道防線配套。 |
| 24 | recipe（seeds + 一條指令）與產物同倉版控 | 🔶 | 對應到「hooks 設定 + skill 指令 = 記憶如何生成的可審計紀錄」，本來就在 repo 裡；不需要額外 seeds.txt 機制，除非啟用 #14 的 URL ingestion。 |
| 25 | 三支柱語彙：context management / enrichment / retrieval | ✅ | 當 vault 文件的頂層架構語彙：PARA+格式 profile = context management；hooks+寫入契約 = enrichment；skill 檢索 SOP = retrieval。三者閉環（寫得好→找得準→enrich 省力）。 |

### 與既有 MemPalace 移植清單的衝突/重複總表

| 既有移植項 | 狀態 | 處置 |
|---|---|---|
| closet pointer 索引行格式 | **衝突**（與 OKF index.md 保留格式） | pointer 格式遷至 `palace/map.md`（type: moc）；`index.md` 讓給 OKF §6 格式 + 自動重生（#13） |
| L0-L1 wake 分層 | 相容 | wake 檔補 OKF frontmatter（type: wake）；加 `user_managed: true`（#2）管寫入權限 |
| temporal fact table | 相容 | 收進固定槽位 `## Facts`（#3）；事實行可加 `^block-id` 供精準引用（Part 1 黃級白名單） |
| hooks 自動歸檔骨架 | 相容需強化 | hook 注入完整合規 frontmatter + 觸發 index 重生 + 走寫入契約四規則（#7）與 guard（#8） |
| raw 逐字層 | 相容需強化 | 每檔仍需 frontmatter（type: raw-log，OKF 硬要求）；append-only 升格為 lint 硬錯誤（#4、#23） |
| palace/log.md | 相容 | 格式對齊 OKF §7（`## YYYY-MM-DD` newest first + 粗體前綴條目） |

---

## 附錄：原始研究發現（rawFindings）

### 1. OKF 完整規格：檔案結構與 concept document 兩段式格式（YAML frontmatter + markdown body）

**運作方式**：SPEC.md 定義（§4, L114-168）：每個 concept 是一個 UTF-8 markdown 檔，兩部分組成 —— (1) 以獨立一行 `---` 開頭、獨立一行 `---` 結尾的 YAML frontmatter；(2) 其後的自由 markdown body。Concept ID = 檔案在 bundle 內的路徑去掉 `.md`（§2, L58-60，例：`tables/users.md` → `tables/users`）。實例見 bundles/crypto_bitcoin/tables/blocks.md（L1-33，type/resource/title/description/tags/timestamp + `# Schema` 表格 + `# Citations`）與 bundles/ga4/references/metrics/event_count.md（L1-18）。

**移植/意義**：這正是「純 markdown + frontmatter」記憶系統的骨幹範式：人類可 `cat`、LLM 可整檔吃進 context、可 git diff。你的 PARA（給人）+ 記憶宮殿（給 LLM）都可直接沿用『frontmatter 存少量可查詢欄位、body 存人與 LLM 真正閱讀的散文/結構』這個分工（README L53-56 明講此意圖）。

**採用**：是

### 2. Frontmatter 欄位規範：唯一必填 `type`，其餘全部選填但有優先順序

**運作方式**：§4.1（L122-162）：**必填**只有 `type`（短字串，用於 routing/filtering/presentation，不中央註冊，consumer 必須寬容處理未知 type）。**建議（依優先序）**：`title`（省略時可由檔名推導）、`description`（單句摘要，供 index/搜尋片段用）、`resource`（底層資產的 canonical URI，抽象概念可無）、`tags`（YAML list of 短字串）、`timestamp`（ISO 8601 最後修改時間）。**擴充**：producer 可加任意 key，consumer 應保留未知 key 且不得因此 reject（L160-162）。實務中三個 bundle 只用了 3 種 type：`BigQuery Dataset`/`BigQuery Table`/`Reference`（跨 bundle 統計），可見 type 是自由但收斂的。

**移植/意義**：對記憶系統極具參考價值：與其設計一大堆必填欄位，不如學 OKF 只強制一個分類鍵（type），其餘欄位『建議但寬容』。這降低 LLM 寫入門檻、避免 schema 僵化。你可把 `type` 對應到 PARA 的 Project/Area/Resource/Archive 或記憶宮殿的節點類型，並保留 `tags`/`timestamp`/`resource` 作為選填 index 欄位。

**採用**：是

### 3. 命名慣例、保留檔名與目錄佈局

**運作方式**：§3（L71-110）：bundle 是 markdown 檔的目錄樹，目錄結構與領域無關、由 producer 自訂分組。**保留檔名**（任何層級都有特殊語意、不得當 concept 用）：`index.md`（目錄清單，§6）與 `log.md`（更新歷史，§7）；其餘所有 `.md` 都是 concept（§3.1, L95-105）。實際 bundle 佈局採 `datasets/`、`tables/`、`references/`（可再巢狀，如 ga4 的 `references/joins/`、`references/metrics/`）分組，每個目錄放一個 `index.md`（見三個 bundle 的 tree）。Appendix A（L400-451）給了最小 bundle 範例。檔名用 slug（小寫、底線），如 `posts_orphaned_tag_wiki.md`、`avg_spend_per_purchase_session_by_user.md`。

**移植/意義**：給你的目錄設計一個乾淨模板：用資料夾做人類導向的 PARA 分組、每層放一個 `index.md` 做『漸進式揭露』（progressive disclosure）給 LLM 逐層導覽而非一次載入整庫。保留檔名的概念（index.md/log.md）可直接借用作為『目錄地圖』與『時間軸日誌』。

**採用**：是

### 4. index.md（漸進式揭露/目錄清單）與 log.md（時間軸日誌）的格式

**運作方式**：§6（L271-294）：`index.md` 可出現在任何目錄含 root，列舉該目錄內容以支援 progressive disclosure。**index.md 不含 frontmatter**（唯一例外見下），body 用 `# 區段標題` 分組 + `* [Title](relative-url) - description` 條目，description 應取自被連結 concept 的 frontmatter。實例：bundles/ga4/index.md（L1-5，用 `# Subdirectories` 列 datasets/references/tables）、bundles/stackoverflow/tables/index.md（L1-18，用 `# BigQuery Table` 列每張表 + 描述）。§7（L298-318）：`log.md` 可在任何層級記錄該範圍變更史，格式為 date-grouped、newest first，`## YYYY-MM-DD` 標題 + `* **Update**: …` 條目；領頭粗體字（Update/Creation/Deprecation）是慣例非強制。實測三個 bundle 都沒有 log.md（find 結果為空），代表 log 是選用。

**移植/意義**：這兩個檔幾乎就是你要的『兩種讀者』橋樑：index.md = 給 LLM 的導覽索引（可自動生成、逐層載入省 context）；log.md = 給人與 LLM 的變更時間軸（適合記憶宮殿的『何時學到什麼』）。可直接把 index.md 當 PARA 資料夾的門面、log.md 當 vault 的 changelog。

**採用**：是

### 5. OKF 要解決的問題（設計動機）

**運作方式**：§1 Motivation（L17-46）+ README『Why OKF?』（L37-74）：AI agent 知識表示法百花齊放且互不相容，OKF 主張知識應存於『通用、既有、無須工具即可存取』的格式，達成四特性：Readable（人不需工具即可讀）、Parseable（agent 不需 bespoke SDK）、Diffable（版本控制）、Portable（跨工具/組織/時間）。**Goals**（L33-39）：定義 enrichment agent 可寫入的通用格式、告知 consumption agent 如何讀取遍歷、促進跨系統知識交換、標準化極少數必填欄位。**Non-goals**（L41-46）：不定固定 taxonomy、不規定儲存/serving/query 基礎設施、不取代領域 schema（Avro/Protobuf/OpenAPI，只 reference 不 subsume）。核心痛點是『避免被 service-owned metadata store 綁定』（README L40-52）。

**移植/意義**：與『純 markdown 記憶系統』的立意完全同源：去中心、免工具、免鎖定、可版本控。可直接引用其 4 大特性（Readable/Parseable/Diffable/Portable）作為你系統的設計原則宣言，並借用『minimally opinionated』哲學 —— 只標準化互通所需的最小規則，其餘留給使用者。

**採用**：是

### 6. bundle 是什麼 + bundles/ 目錄實際內容

**運作方式**：§2（L52-57）：**Knowledge Bundle = 自足、階層式的知識文件集合，是『發布/散布的單位』**。一個 bundle 可散布為 (a) git repo（推薦，有歷史/歸屬/diff）、(b) tarball/zip、(c) 更大 repo 的子目錄（§3, L89-93）。okf/bundles/ 底下有三個由 reference agent 產生的現成範例（README L27-35, L124-147）：**crypto_bitcoin/**（Bitcoin blocks/transactions/inputs/outputs，含 datasets/ + tables/ + index.md + viz.html）、**ga4/**（GA4 電商 dataset，含 datasets/ + tables/ + references/{joins,metrics}/ + viz.html）、**stackoverflow/**（Stack Overflow 公開資料集，含 datasets/ + tables/（18 表）+ references/（36 份參考）+ viz.html）。每個 bundle 附一個 `viz.html`（自足互動式 Cytoscape.js 圖譜，是 OKF 的 PoC consumer，README L149-206）。每個 bundle 在 samples/<name>/ 有對應 recipe（seed URLs + enrich 指令）。

**移植/意義**：『bundle = 一個目錄 = 發布單位』對你很關鍵：整個記憶 vault 或某個 PARA 專案都可視為一個可打包/可 git clone/可交換的 bundle。viz.html 展示了『純 markdown 可被任意 consumer 消費、包括生成圖譜』——記憶宮殿的空間圖譜可用同法從 markdown 連結反算出來。

**採用**：是

### 7. wiki 連結（cross-linking）規範

**運作方式**：§5（L233-267）：concept 間用**標準 markdown link**連結（非 wikilink `[[…]]`），兩種形式：(1) **絕對/bundle-relative** 以 `/` 開頭、相對 bundle root，如 `[customers](/tables/customers.md)` —— 這是**推薦**形式，因為文件在子目錄內移動時仍穩定（§5.1, L238-248）；(2) **相對路徑** 如 `[neighbor](./other.md)`（§5.2）。**Link semantics**（§5.3, L257-267）：A→B 的連結只表達『有關係』，關係種類（parent/child、references、joins-with、depends-on）由周圍散文承載，link 本身不帶型別；consumer 建圖時通常視所有 link 為『無型別有向邊』。**consumer 必須容忍 broken link**（目標不存在不算 malformed，可能只是尚未寫的知識）。實例：blocks.md 內文以散文帶關係，Appendix A 的 orders.md 用 `[customers](/tables/customers.md)`。README L68-70 強調『graph-shaped, not just tree-shaped』。

**移植/意義**：重要取捨點：OKF 刻意用標準 markdown link + 絕對路徑，而非 Obsidian 的 `[[wikilink]]`。若你的系統要相容 Obsidian，需自行決定用 wikilink 還是 OKF 式路徑連結。但『連結=無型別有向邊、關係語意靠散文、容忍斷鏈』這三點對 LLM 記憶宮殿很受用——讓 LLM 自由織網、事後再從連結反算圖譜，且允許『指向尚未寫的知識』的前瞻連結。

**採用**：是　**注意**：OKF 用標準 markdown 路徑連結，不是 Obsidian wikilink；且明確容忍 broken link（不可因斷鏈 reject bundle，§9 L352-358）。與 Obsidian 生態整合時此差異需權衡。

### 8. tag 與日期格式的規定

**運作方式**：**Tag**：frontmatter `tags` 是選填的 YAML 短字串 list（§4.1, L157），用於 cross-cutting 分類。Tag 是 first-class concept，但 **OKF 不另定 tag 聚合檔格式**；想要 tag 瀏覽視圖的 producer 可在 consumption time 掃 frontmatter 自行合成（§3.1, L107-110）。實務寫法為 YAML block list（blocks.md L6-10：`tags:` 換行 `- bitcoin` `- bigquery` …），SPEC 範例也用 inline flow list `tags: [sales, orders, revenue]`（L187），兩種皆可。**日期/時間格式**：一律 ISO 8601。frontmatter `timestamp` 用完整 ISO 8601 datetime（§4.1 L158；範例 `2026-05-28T14:30:00Z`，實檔用帶 offset 的 `'2026-05-28T22:43:59+00:00'`，blocks.md L11）。log.md 的日期標題**必須**用 ISO 8601 `YYYY-MM-DD`（§7 L316）。

**移植/意義**：對記憶系統的直接可借規則：tag 用選填 YAML list、不預先建 tag 索引檔而是查詢時動態聚合（避免維護負擔）；所有時間戳統一 ISO 8601（frontmatter 用 datetime、日誌標題用 YYYY-MM-DD）。這讓 LLM 寫入時格式明確、人與工具都好解析與排序。

**採用**：是　**注意**：tags 的兩種 YAML 寫法（flow `[a, b]` 與 block `- a`）在範例與實檔混用；若你要嚴格 lint 需自行擇一。

### 9. Conformance（一致性）與寬容消費模型

**運作方式**：§9（L341-362）：bundle 符合 OKF v0.1 的**唯三條件**：(1) 每個非保留 `.md` 都有可解析的 YAML frontmatter；(2) 每個 frontmatter 都有非空 `type`；(3) 保留檔名（index.md/log.md）present 時遵循 §6/§7 結構。其餘全為 soft guidance，consumer **不得**因下列而 reject：缺選填欄位、未知 type、未知額外 key、斷鏈、缺 index.md。§11（L382-396）：版本以 `<major>.<minor>` 標示，bundle 可在 **root index.md 的 frontmatter** 放 `okf_version: "0.1"`（這是 index.md 唯一允許 frontmatter 的地方）；實測三 bundle 皆未宣告（find 未發現任何帶 frontmatter 的 index.md）。

**移植/意義**：這套『極寬容消費』哲學是 LLM 維護型記憶庫的關鍵：因為內容會由 agent 逐步生成、重構、部分完成，系統必須容忍不完整/未知欄位/斷鏈而不崩。你的 lint/validator 應區分『硬性錯誤（缺 type、frontmatter 不可解析）』與『軟性提醒（缺 description、斷鏈）』，正如 OKF §9。

**採用**：是

### 10. 與其他格式的關係（定位）

**運作方式**：§10（L366-379）：OKF 自認接近三種既有模式——(1) 用 markdown+frontmatter 當 agent 可讀知識庫的『LLM wiki repositories』；(2) Obsidian/Notion 這類階層 markdown + cross-link 的個人知識工具；(3) 把 catalog metadata 存在原始碼旁而非獨立 registry 的『metadata as code』。OKF 的差異在於它被**規格化**——釘死互通所需的最小規則、但不指定工具。README L61-64 也列出 Notion/Obsidian/MkDocs/Hugo/Jekyll 皆原生支援 md+YAML frontmatter，故 bundle 可被既有工具直接瀏覽/編輯/渲染。

**移植/意義**：直接印證你的方向：OKF 明確把『LLM wiki』與『Obsidian/Notion 個人知識庫』視為同類，只是多了一份薄規格。你可把 OKF 當成『PARA(給人) + 記憶宮殿(給 LLM)』的底層檔案契約——沿用其最小規格，再在上層加 PARA 資料夾語意與記憶宮殿的連結語意，即可同時相容既有 markdown 工具鏈。

**採用**：是

### 11. OKF 參考實作提供的操作總覽（從 tests 檔名 + CLI 反推）

**運作方式**：程式碼只暴露兩個使用者層級 CLI 子命令：`enrich`（產生/豐富 bundle）與 `visualize`（產生 HTML 圖），見 cli.py:63-161。tests 檔名對應到內部模組化的能力層：test_document.py→OKF 文件解析/序列化/驗證（bundle/document.py）、test_index.py→索引重生（bundle/index.py）、test_bundle_tools.py→`write_concept_doc`/`read_existing_doc` 寫入工具（tools/bundle_tools.py）、test_viewer.py→bundle 視覺化（viewer/generator.py）、test_web_fetcher.py→單頁抓取轉 markdown（web/fetcher.py）、test_web_tools.py→受控爬蟲 `fetch_url`（tools/web_tools.py）。此外 tests/test_bigquery_source.py 對應資料來源介面。所以操作分四類：(a) 文件格式層、(b) 索引層、(c) 產生/豐富層（LLM agent + tools）、(d) 消費層（viewer）。

**移植/意義**：這個分層正是純 markdown 記憶系統該有的骨架：把「文件格式契約」「索引/導航」「寫入/維護工具」「消費/瀏覽」四件事拆開。記憶宮殿給 LLM 的部分對應 (c)+(b)（agent 用 read/write/list 工具維護結構），PARA 給人的部分對應 (a)+(d)（人可直接 cat/在 Obsidian 瀏覽）。值得照抄這種「同一批 markdown、多端各取所需」的切法。

**採用**：是

### 12. OKF 文件 = YAML frontmatter + markdown body，四個必填 key 作為最小互通契約

**運作方式**：bundle/document.py:8 定義 REQUIRED_FRONTMATTER_KEYS=(type,title,description,timestamp)。OKFDocument.parse（:22-47）手寫解析 `---` 分隔的 frontmatter（不依賴額外套件，只用 yaml.safe_load），body 保留原樣；serialize（:49-54）用 `yaml.safe_dump(sort_keys=False)` 保持鍵序；validate（:56-61）只檢查必填 key 非空。write_concept_doc（tools/bundle_tools.py:73-108）在寫入前呼叫 validate，失敗回傳結構化 error 要求 LLM 重寫，並用 _reorder_frontmatter（:45-53）把 key 排成偏好順序 type/resource/title/description/tags/timestamp。README:53-60 明言「少量必填 key 保互通、其餘 frontmatter 與 body section 可任意擴充」。

**移植/意義**：直接對應記憶系統的 note 格式設計：用極小的必填 frontmatter（type/title/description/timestamp）當機器可查詢的骨架，body 放人與 LLM 真正讀的散文。特別是 `description` 被設計成一句話且會被逐字複製進 index.md（見索引發現），這對 PARA 的 MOC/index 導航很關鍵。validate→回傳 error 讓 LLM 自我修正的模式，值得用在 LLM 寫入自己的記憶時。

**採用**：是

### 13. index 機制：每層目錄自動重生一個 index.md，達成漸進式揭露（progressive disclosure）

**運作方式**：bundle/index.py:regenerate_indexes（:49-103）。步驟：(1) _directories_to_index（:37-46）用 rglob 收集所有含 .md 的目錄；(2) 依深度由深到淺排序（:60-63，key=-depth）做 bottom-up 走訪；(3) 每個目錄列出子項：.md 檔取其 frontmatter 的 title/description/type（:73-81），子目錄則做為 `Subdirectories` 條目並帶上該子目錄的描述（:82-84）；(4) _build_index_text（:21-34）依 type 分組、組內按 title 排序，輸出 `* [title](relative_link) - description` 的 markdown 清單；(5) 寫出 index.md（:89-91）。維護的『索引結構』本質是：每個 index.md 是該層的一句話目錄，向下只揭露一層（子檔案 + 子目錄摘要），而非攤平整棵樹。README:65-67 稱此為『progressive disclosure built in』，讓 agent/人一次只載入一層。

**移植/意義**：這是記憶宮殿導航的核心可偷點：LLM 不需一次載入整個 vault，而是從根 index.md 逐層下鑽（每層只花少量 token）。對『PARA 給人』也友善——index.md 就是自動生成的 MOC。純 markdown 系統可完全照抄這個『每資料夾一個自動重生的 index.md，內容 = 子項 title+一句話 description，按 type 分組』的演算法。

**採用**：是

### 14. 目錄描述的向上聚合：單一子項複用其描述，多子項則呼叫 LLM 合成一句話

**運作方式**：index.py:93-101 —— 走訪到非根目錄時，若該目錄只有 1 個子項且該子項有 description，就直接複用該 description 當作此目錄的摘要（:97-98，零 LLM 呼叫）；否則呼叫 synthesize（bundle/synthesizer.py）用 LLM 把子項 (title, desc) 列表壓成一句 ≤25 字的目錄摘要（:99-101）。synthesizer.py:26-50 用固定 prompt 呼叫 gemini，失敗則 _fallback（:21-24）退化為『Contains N entries: t1, t2...』。因為是 bottom-up，深層目錄的摘要會先算好、被淺層 index 當作子目錄描述引用（dir_descriptions 快取，:65,:84）。test_index.py:74-94 驗證單子項複用（call_count==0）。

**移植/意義**：記憶系統做資料夾層級摘要時的省成本模式：能複用就不呼叫 LLM，只有真的需要壓縮多筆時才用 LLM，且有確定性 fallback。對『記憶宮殿』的房間標題自動生成很適用——每個 PARA 資料夾的一句話摘要可以這樣 bottom-up 累積，讓上層 index 讀起來像有意義的地圖而非檔名清單。

**採用**：是　**注意**：合成需要 LLM 呼叫且不可決定性；純本地/離線記憶系統可只用 _fallback 那種確定性摘要，或改用『取第一個子項描述 + 計數』的規則。

### 15. cross-link 用相對 markdown 連結表達概念關係，讓 tree 變 graph

**運作方式**：reference_instruction.md:54-74 規定 LLM 在散文中提到其他概念時，必須用『相對於當前文件目錄』的 markdown 連結（如 `[users](users.md)`、`[dataset](../datasets/x.md)`），禁止以 `/` 開頭（避免破壞 GitHub 渲染）、只能連 list_concepts() 回傳的既有 id。消費端 viewer/generator.py:_extract_links（:48-66）用正則 `\]\(([^)\s]+\.md)...\)`（:12）抓 body 內的相對連結、解析成 bundle 相對的 concept id，_build_graph（:98-126）把每條連結變成有向邊、丟掉指向不存在節點的 dangling link（:105）。README:68-70 稱『Graph-shaped, not just tree-shaped』。

**移植/意義**：正是『PARA（樹）+ 記憶宮殿（圖）』雙結構的實作關鍵：資料夾階層給人做 PARA 分類，而 wikilink/相對連結在其上疊一層知識圖，表達比父子更豐富的關係。Obsidian 的 wikilink 天然支援這點；偷這個設計就是『分類靠資料夾、關聯靠連結、兩者共存於同一批 md』。viewer 從 body 連結反推邊的做法，也可直接搬去做記憶圖譜視覺化。

**採用**：是

### 16. backlinks（Cited by）由連結圖反向計算，不需另存資料

**運作方式**：README:171-173 描述 viewer 的『Cited by』反向連結清單是『computed from the reverse of the link graph』。實作上 generator.py 只正向收集每個 concept 的 links_to（Concept.links_to，:30；_extract_links :48-66），邊集合（_build_graph :98-117）即為 (source,target) 對；反向即得 backlinks。連結是單一事實來源，正反向都從它導出，無需在文件裡手動維護『被誰引用』。

**移植/意義**：記憶系統不該手動維護雙向連結——只存正向 wikilink，backlink 一律即時反算。Obsidian 本身就這樣做。這確認了純 markdown 記憶宮殿只要維護單向 `[[link]]`，反向導航（『這個概念被哪些筆記引用』）可零成本導出，降低 LLM 維護負擔與不一致風險。

**採用**：是

### 17. 寫入護欄（augmentation guard）：LLM 二次寫入時拒絕『縮水』既有結構化內容

**運作方式**：tools/bundle_tools.py:114-154。當處於 web pass（is_web_pass()，context.py:78-80 以 _web 狀態是否存在判斷）且目標檔已存在、且既有 type==『BigQuery Table』時：比對新舊 body 的 `# Schema` 欄位名集合（_schema_field_names 用正則抓 backtick 名，:34-38）與 `# Citations` 條目數（_citation_entry_count，:41-42）。若新版遺漏了舊版的 schema 欄位或引用變少，直接回傳 error（列出缺哪些欄位），拒絕寫入並要求 LLM 先 read_existing_doc 再補全。web_ingestion_instruction.md:89-133 用自然語言重申『augmentation 不是 rewrite，既有每個 # heading 必須原序保留』。tests/test_bundle_tools.py:57-127 驗證：web pass 拒絕 schema/citation 縮水，但允許新增 section，且非 web pass（純 BQ 重跑）可合法縮減。

**移植/意義**：這是 LLM 自我維護記憶時最重要的可偷設計：防止 agent 在『更新』一則記憶時把先前累積的內容覆寫掉（catastrophic overwrite）。純 markdown 記憶系統應在寫入工具層加類似不變量檢查——例如『既有 heading 不可消失』『引用/來源只增不減』『關鍵欄位集合不可縮小』——並在違反時回傳可操作的 error 讓 LLM 修正，而非靜默接受破壞性寫入。

**採用**：是　**注意**：OKF 的護欄硬編碼在 type=='BigQuery Table' 且只在 web pass 生效（bundle_tools.py:119），是為它兩段式 pipeline 量身；記憶系統要把觸發條件一般化（例如對所有既有文件都檢查 heading 不消失），並想清楚哪些是真正的不變量、哪些是合法演進。

### 18. read-before-write 工作流：LLM agent 先讀既有文件再精煉，而非盲寫

**運作方式**：reference_instruction.md:5-16 的固定 workflow：(1) read_existing_doc → (2) read_concept_raw 取結構化 metadata → (3) 選擇性 sample_rows → (4) list_concepts 取得可連結目標 → (5) 呼叫 write_concept_doc『恰好一次』。read_existing_doc（bundle_tools.py:56-70）回傳 {frontmatter, body} 或 null。agent 工具集在 agent.py:27-54 綁定（BQ agent 5 個工具、web agent 加 fetch_url）。整個 pipeline 是兩個獨立 ADK Agent（build_bq_agent / build_web_agent）由 ReferenceRunner 依序跑（runner.py:259-280：先逐概念 enrich、再 run_web_pass、最後 regenerate_indexes）。

**移植/意義**：記憶宮殿的 LLM 維護迴圈應照這個順序：先 read_existing（避免覆寫）→ 蒐集新資料 → list 既有概念（才能正確 cross-link）→ 一次寫入。『list_concepts 後才寫連結』確保 LLM 只連到真實存在的筆記、不捏造連結目標——這對防止記憶圖出現死連結很關鍵。工具介面（read_existing/list/write 三件套 + 相對路徑 concept_id）幾乎可原樣移植到 obsidian-cli 之上。

**採用**：是

### 19. samples 展示的工作流 = 『recipe（seeds+指令）→ bundle（產物）→ viz.html』可重現三段式

**運作方式**：samples/ 每個子目錄（crypto_bitcoin/ga4_merch_store/stackoverflow）只含兩檔：README.md（recipe：前置條件 + 一條 `enrich` 指令）與 seeds.txt（web pass 的種子 URL，每行一個、# 為註解，cli.py:_parse_seed_file :27-34 解析）。README（README.md:124-147）說明 recipe 對應到已 checked-in 的 bundles/<name>/ 產物與其 viz.html。完整工作流：`python -m reference_agent enrich --source bq --dataset <p.d> --web-seed-file seeds.txt --out bundles/<name>`（ga4 README:28-34），內部兩段式（README.md:92-105）：BQ pass 用純 BigQuery metadata 每概念寫一 doc；web pass 讓 LLM 當爬蟲從 seeds 出發、判斷哪些外連值得跟、對每頁決定 enrich 既有 concept / mint references/<slug> / skip（受 --web-max-pages、allowed-hosts、max-depth 硬限制）；最後 regenerate_indexes 重生所有 index.md；再用 `visualize` 產 viz.html。三個 sample 各示範不同資料形狀：GA4 單一寬表、StackOverflow 多獨立實體、Bitcoin 少數緊密關聯 fact 表（crypto README:10-13）。

**移植/意義**：對記憶系統的啟示：把『如何產生記憶』做成可重現的 recipe（種子輸入 + 一條指令）並與『產物』一起版控，等於為 LLM 記憶建構過程留下可審計、可重跑的軌跡。seeds.txt 這種『純文字、行為單位、# 註解』的最小輸入格式也適合當記憶系統的 ingestion 清單。三種資料形狀的對照也提醒：記憶結構要能同時容納單一大節點、多獨立節點、與強關聯小簇。

**採用**：是

### 20. CLI 是唯一入口，沒有 MCP / server；agent 能力包成 ADK FunctionTool

**運作方式**：入口只有 CLI：pyproject.toml:21-22 註冊 console_script `reference-agent = reference_agent.cli:main`；__main__.py:1-4 讓 `python -m reference_agent` 走同一 main。cli.py:59-161 定義 argparse 兩子命令 `enrich` 與 `visualize`。全 repo grep `mcp|fastapi|flask|serve|@app` 無任何 MCP server 或 HTTP 服務命中（唯一 'serve' 命中是 runner.py 註解字串）。LLM 可呼叫的『工具』是 ADK FunctionTool（agent.py:31-38, 47-53）：list_concepts / read_concept_raw / sample_rows / read_existing_doc / write_concept_doc（+ web agent 的 fetch_url），但這些是 in-process 給 ADK agent 用，並未透過 MCP 對外暴露。viewer 產出的 viz.html 是完全自包含、無 backend（README:150-160）。

**移植/意義**：對照你的目標：OKF 刻意不做 server/MCP——bundle 就是一堆檔案，消費端（LLM 載入 context、Obsidian、靜態 server、viz.html）各自讀檔即可（README:17-20）。這支持『純 markdown 記憶系統』的定位：不需要專屬服務層，人用 Obsidian/PARA、LLM 用檔案工具（如 obsidian-cli 或等價的 read/write/list）即可。若未來要讓外部 agent 存取記憶，才需在這批工具外再包一層 MCP——OKF 沒做，是留給消費端的自由。

**採用**：否　**注意**：OKF 的工具是 ADK-in-process，不是 MCP；若記憶系統想讓多個 client（Claude Code、其他 agent）共用，需自行把 read_existing/list/write 這組介面包成 MCP server——這是 OKF 未涵蓋、需自行設計的部分。

### 21. 受控 LLM 爬蟲：把 crawl 預算/邊界硬編在 tool 內，agent 無法越界

**運作方式**：tools/web_tools.py:fetch_url（:10-101）在回傳頁面內容前，於 tool 內部強制所有限制：scheme 檢查、allowed_hosts（:44）、allowed_path_prefixes（:50）、denied_path_substrings（:57）、去重 visited（:60）、max_pages 預算（:62）、以及關鍵的 depth 追蹤——只有被既有已抓頁面回傳過的連結才有登記 depth，agent 自己捏造的 URL 會因 depth is None 被拒（:65-74），超過 max_depth 也拒（:75-78）。狀態存在 WebState（context.py:15-24），seeds 預登記為 depth 0（context.py:61-62）。被拒時回傳 {error,...} 而非內容，prompt 明示『不要重試被拒 URL』（web_tools.py:16-27）。fetcher.py:fetch_and_parse（:62-88）負責實抓：擋非 HTML、按 charset 解碼、markdownify 轉 md、截斷到 40KB（:11,:55-59）。

**移植/意義**：若記憶系統要讓 LLM 自主從 URL 汲取知識（你的 use case 之一：ingest URL），這是可偷的安全模式——把『能抓幾頁、能走多深、能碰哪些 host/path』全部在工具層強制，而不是靠 prompt 請求 LLM 自律。depth 只認『從種子可達的連結』防止 LLM 幻想 URL，這點對記憶正確性尤其重要。回傳結構化 error + 明示不要重試，是讓 LLM 優雅停止的好介面。

**採用**：是

### 22. viewer：把整個 bundle 序列化進單一自包含 HTML 做為 OKF 的『消費端 PoC』

**運作方式**：viewer/generator.py:generate_visualization（:139-175）走訪 bundle（_walk_concepts :69-95，跳過 index.md）、抽連結建圖（_build_graph）、把 graph 以 JSON 塞進 HTML 模板（template.replace `__BUNDLE_DATA__` 等佔位符，:161-167），CSS/JS 也 inline（viewer/static/viz.js、viz.css）。前端用 Cytoscape.js 畫力導向圖、marked 在瀏覽器渲染 markdown body（README:200-206），節點按 type 上色（_TYPE_PALETTE :13-17），節點大小依 body 長度（to_node :43）。搜尋、type filter、多種 layout、Cited-by backlinks 皆前端計算。無 backend、資料不離頁。

**移植/意義**：對記憶系統：這示範了『同一批 markdown 可被任意消費端各自渲染』——人用 Obsidian graph view、LLM 載入 context、或一個自包含 HTML 分享給沒裝任何工具的人。記憶宮殿的圖譜視覺化可直接借這套（Cytoscape + 從連結抽邊 + type 上色 + backlink），且『把資料嵌進單檔 HTML』利於分享一份記憶快照。','worth_stealing 標記為 true。

**採用**：是　**注意**：generator 用正則抽 markdown 連結（generator.py:12）與手寫 frontmatter 解析，對 wikilink（`[[...]]`）語法不認得——若記憶系統用 Obsidian wikilink 而非標準 `[](path)`，抽邊正則需改寫。

### 23. Wikilink 語法家族（內部連結）

**運作方式**：obsidian-markdown/SKILL.md:21-43 定義五種 wikilink 形式：`[[Note Name]]`（連到筆記）、`[[Note Name|Display Text]]`（自訂顯示文字）、`[[Note Name#Heading]]`（連到標題）、`[[Note Name#^block-id]]`（連到區塊）、`[[#Heading in same note]]`（同檔標題）。SKILL.md:19 明確建議：vault 內部筆記用 `[[wikilink]]`（Obsidian 會自動追蹤改名），外部 URL 才用標準 `[text](url)`。wikilink 用「筆記名稱」而非路徑解析（呼應 obsidian-cli SKILL.md:35 `file=<name>` resolves like a wikilink）。

**移植/意義**：對『PARA 給人 + 記憶宮殿給 LLM』的純 markdown 系統，wikilink 是 LLM 建立跨筆記關聯（記憶宮殿的『房間之間走廊』）的核心機制。因為它以筆記名解析、改名自動更新，LLM 可以只維護語意連結而不需管實體路徑——但這也意味著筆記檔名必須全 vault 唯一或至少可區分，否則連結歧義。

**採用**：是　**注意**：wikilink 是 Obsidian 專屬語法，非 CommonMark/GFM；若記憶內容要被 Obsidian 以外的 markdown 工具消費，wikilink 不會被解析（會原樣顯示 `[[...]]`）。

### 24. Embed（transclusion）語法：wikilink 前加 `!`

**運作方式**：obsidian-markdown/SKILL.md:45-57 與 references/EMBEDS.md:1-63。任何 wikilink 前綴 `!` 即內嵌其內容：`![[Note Name]]`（整篇）、`![[Note Name#Heading]]`（章節）、`![[Note Name#^block-id]]`（區塊）、`![[image.png|300]]`（圖片含寬度）、`![[document.pdf#page=3]]`（PDF 指定頁）。EMBEDS.md 另涵蓋 audio/video、外部圖片 `![Alt|300](url)`、以及 `![[Note#^list-id]]` 內嵌清單、與 ```query 搜尋結果內嵌（EMBEDS.md:57-63）。

**移植/意義**：embed 讓 LLM 可用 DRY 方式組裝記憶：一份原子知識點寫一次，在多個 PARA 位置或索引筆記 transclude 引用，避免內容重複與不同步。記憶宮殿的『索引/目錄筆記』可用 `![[]]` 聚合子筆記章節，人類與 LLM 看到的都是同一份 source of truth。

**採用**：是　**注意**：embed 同樣是 Obsidian 專屬；且 block/heading embed 依賴穩定的 heading 文字與 block-id，重構筆記標題會靜默斷開內嵌。

### 25. Block reference（區塊 ID）機制

**運作方式**：obsidian-markdown/SKILL.md:31-43。在任何段落尾端加 `^block-id` 定義可被連結的區塊（例：`This paragraph can be linked to. ^my-block-id`，SKILL.md:34）；清單與引言則須把 block ID 放在區塊後的『獨立一行』（SKILL.md:37-43，例 `> A quote block` 空行後接 `^quote-id`）。之後以 `[[Note#^block-id]]`（連結）或 `![[Note#^block-id]]`（內嵌）引用。

**移植/意義**：block reference 是最細粒度的記憶定址——LLM 可為單一事實/決策打上穩定錨點，其他筆記精準引用而不需複製。這對『記憶宮殿要求可回溯到確切出處』很關鍵。設計純 markdown 記憶系統時可約定：每個原子知識點結尾自動生成 `^id`，形成穩定的引用把手。

**採用**：是　**注意**：block-id 語法 `^id` 在非 Obsidian 環境會以純文字外露於行尾，影響外部渲染的視覺整潔；清單/引言的 ID 需放獨立行是易錯點。

### 26. Callout 區塊（`> [!type]`）與可折疊/巢狀

**運作方式**：obsidian-markdown/SKILL.md:59-74 與 references/CALLOUTS.md:1-58。語法建立在 blockquote 之上：`> [!note]`、`> [!warning] Custom Title`、可折疊 `> [!faq]-`（預設收合）/`> [!faq]+`（預設展開）（SKILL.md:66-70）。CALLOUTS.md:33-49 列出 13 種型別與別名表（如 tip→hint/important、warning→caution/attention、success→check/done、question→help/faq），並支援巢狀（CALLOUTS.md:26-31）與 CSS 自訂型別 `data-callout="custom-type"`（CALLOUTS.md:52-58）。

**移植/意義**：callout 建構在標準 blockquote 上，所以即使脫離 Obsidian 也『優雅降級』為引言區塊——比 wikilink/embed 更可攜。記憶系統可用固定 callout 型別作為給人看的語意標記（如 `[!warning]` 標註過時知識、`[!info]` 標註 metadata），LLM 靠 `[!type]` 前綴做結構化擷取。

**採用**：是　**注意**：自訂 callout 型別需要 CSS 才有顏色/圖示，純文字 vault 分享時樣式不會跟著走。

### 27. Frontmatter Properties 型別系統

**運作方式**：obsidian-markdown/SKILL.md:76-94 與 references/PROPERTIES.md:1-61。YAML frontmatter 置於檔案最前。PROPERTIES.md:24-34 定義七種型別：Text、Number（`rating: 4.5`）、Checkbox（`completed: true`）、Date（`2024-01-15`）、Date & Time（`2024-01-15T14:30:00`）、List（`[a,b]` 或 YAML list）、Links（`related: "[[Other Note]]"` — 注意連結型必須加引號包住 wikilink）。三個 Obsidian 保留/預設屬性：`tags`（可搜尋、進 graph view）、`aliases`（連結建議用的別名）、`cssclasses`（套用到該筆記的 CSS class），見 PROPERTIES.md:36-40。

**移植/意義**：這是三個問題交會的關鍵層。對『人用 PARA + LLM 用記憶宮殿』雙讀者，frontmatter 是唯一同時被 Obsidian UI、LLM parser、以及外部 schema 三方消費的結構化區。設計時要把記憶系統自己的欄位（如 category/status/source/confidence）與 Obsidian 保留欄位（tags/aliases/cssclasses）並存於同一份 YAML。

**採用**：是　**注意**：Links 型 property 若忘記加引號（`related: [[Note]]`）會被 YAML 當成無效流式序列而解析失敗——是 frontmatter 最常見的靜默錯誤。

### 28. Tag 語法規則（inline 與 frontmatter 兩處）

**運作方式**：obsidian-markdown/SKILL.md:96-103 與 PROPERTIES.md:42-61。兩種定義位置：inline `#tag`、`#nested/tag`（正文中），或 frontmatter `tags:` 清單。字元規則（SKILL.md:103 / PROPERTIES.md:51）：可含各語言字母、數字（但不可當首字元）、底線 `_`、連字號 `-`、正斜線 `/`（用於階層巢狀）。重點差異：frontmatter 的 tags 值『不帶 `#`』（PROPERTIES.md:56-60 直接寫 `- nested/tag2`），inline 才帶 `#`。

**移植/意義**：tag 的 `/` 階層天然對應 PARA/記憶宮殿的分類樹（如 `#area/health`、`#memory/palace/room-3`）。LLM 可用 nested tag 建立正交於資料夾的第二維分類，而人類在 Obsidian 用 tag pane 瀏覽。純 markdown 系統可把 tag 當成 LLM 的『輕量標籤索引』，比開新資料夾成本低。

**採用**：是　**注意**：數字不可為首字元、frontmatter 不帶 `#` 這兩條規則常被外部 schema 或 LLM 生成違反，導致 tag 靜默失效（不進 Obsidian tag 索引）。

### 29. 其他 Obsidian 專屬標記：comment、highlight、math、mermaid、footnote

**運作方式**：obsidian-markdown/SKILL.md:105-153。Comment `%%hidden%%`（inline 或整塊，reading view 隱藏，SKILL.md:107-113）；Highlight `==text==`（SKILL.md:117-119）；LaTeX math 行內 `$...$` 與區塊 `$$...$$`（SKILL.md:121-130）；Mermaid ```mermaid 圖，且可用 `class NodeName internal-link;` 讓節點連回筆記（SKILL.md:132-143）；Footnote `[^1]` 與 inline `^[...]`（SKILL.md:145-153）。

**移植/意義**：`%%comment%%` 特別有用：LLM 可把『給機器的 metadata / 維護註記 / 記憶宮殿內部指標』藏在 comment 裡，人類 reading view 完全看不到，達成『同一檔案雙層資訊（人看渲染層、LLM 看原始層）』。Mermaid 的 `internal-link` 可讓記憶宮殿的空間圖直接可點擊導航。

**採用**：是　**注意**：`%%...%%` 只有 Obsidian reading view 會隱藏；在 GitHub 等外部 markdown 渲染器會原樣顯示，等於洩漏內部註記。

### 30. obsidian-cli：核心 CRUD 與呼叫語法

**運作方式**：obsidian-cli/SKILL.md 整份。CLI 操作『執行中的 Obsidian 實例』（需 app 開著，SKILL.md:8）。語法：parameters 用 `=` 帶值（`name="My Note"`），flags 是無值布林開關（`silent overwrite`，SKILL.md:15-27）；多行內容用 `\n`/`\t`（SKILL.md:28）。讀寫命令範例（SKILL.md:46-58）：`read file=`、`create name= content= template= silent`、`append file= content=`、`daily:read`、`daily:append`。SKILL.md:12 指出 `obsidian help` 才是永遠最新的完整命令清單。

**移植/意義**：這是純 markdown 記憶系統的『寫入 API』。LLM 不必自己操作檔案系統與處理 frontmatter 合併，而是透過 CLI 讓 Obsidian 本身當寫入中介（保證 index、backlink、property 快取同步）。`create ... template=` 支援模板，可強制每個新記憶點套用統一 frontmatter schema。

**採用**：是　**注意**：CLI 依賴 Obsidian 必須在前景執行（SKILL.md:8）；純 headless/CI 的記憶維護流程無法只靠此 CLI，需要 fallback 到直接檔案操作。

### 31. obsidian-cli：搜尋、property 操作、tasks/tags/backlinks 查詢

**運作方式**：obsidian-cli/SKILL.md:46-61。搜尋 `search query="term" limit=10`；property 操作 `property:set name="status" value="done" file="My Note"`（結構化改欄位，不需自己 parse YAML）；`tasks daily todo`（查任務）；`tags sort=count counts`（tag 統計）；`backlinks file="My Note"`（反向連結）。通用修飾：`--copy`（輸出到剪貼簿）、`silent`（不開檔）、`total`（list 命令回計數）（SKILL.md:60）。檔案定位 `file=`（wikilink 式名稱）vs `path=`（vault root 精確路徑），無指定則用 active file（SKILL.md:31-36）。

**移植/意義**：`property:set`、`backlinks`、`tags counts`、`search` 正好構成記憶系統的『查詢/維護/健康檢查』工具箱：LLM 可用 `backlinks` 找孤立筆記、`tags counts` 稽核分類一致性、`property:set` 批次修正 schema 欄位。這讓『記憶宮殿的自我維護（lint/health check）』不必自己重寫 markdown parser。

**採用**：是　**注意**：`property:set` 走 Obsidian 的 property API，能保證型別正確；但若外部 schema 要求的欄位順序或註解，CLI 無法保留（YAML 會被 Obsidian 正規化重寫）。

### 32. obsidian-cli：插件/主題開發與除錯命令

**運作方式**：obsidian-cli/SKILL.md:63-106。develop/test 迴圈：`plugin:reload id=`（重載）→ `dev:errors`（抓錯）→ `dev:screenshot path=` / `dev:dom selector= text`（視覺/DOM 驗證）→ `dev:console level=error`（主控台）。另有 `eval code="app.vault.getFiles().length"`（在 app context 執行 JS）、`dev:css selector= prop=`（讀 CSS 值）、`dev:mobile on`（行動版模擬）。SKILL.md:106 提到還有 CDP 與 debugger 控制命令。

**移植/意義**：與純 markdown 記憶系統關聯較弱，但 `eval code=` 是隱藏的強力後門：LLM 可透過 `app.vault` / `app.metadataCache` API 做 CLI 未直接提供的批次查詢或跨筆記分析（例如列出所有缺特定 frontmatter 欄位的檔案），作為記憶系統 lint 的萬用逃生艙。

**採用**：否　**注意**：`eval` 執行任意 JS 於 app context，威力大但無型別保護；且這組命令本質是為 plugin/theme 開發設計，非記憶內容管理。

### 33. 衝突焦點一：Frontmatter 欄位語義與型別衝突

**運作方式**：綜合 PROPERTIES.md:24-40 與 SKILL.md:76-94。Obsidian 對三個欄位有『保留語義』：`tags`（必須無 `#`、進 graph/搜尋索引，PROPERTIES.md:56-60）、`aliases`（餵給連結建議）、`cssclasses`（套 CSS）。若外部 schema 也定義同名欄位卻用不同型別或語義（例：外部要 `tags: "a,b"` 逗號字串，Obsidian 要 YAML list；或外部把 `aliases` 當自由文字），Obsidian 端會誤解或忽略。Links 型欄位要求 wikilink 加引號（PROPERTIES.md:34 `related: "[[Other Note]]"`），外部 schema 若禁止引號或不認 `[[]]` 則衝突。

**移植/意義**：這是『被 Obsidian 完整支援』且『被外部 schema 約束』最主要的撞車點。對雙讀者記憶系統，建議：(a) 保留 `tags/aliases/cssclasses` 給 Obsidian 語義、外部 schema 欄位另用不重疊命名空間（如 `mem_category`、`para_type`）；(b) 型別上取交集（一律用 YAML list、日期用 ISO 8601 兼容 Obsidian Date & Time）。

**採用**：是　**注意**：衝突多為『靜默』——YAML 仍合法解析，但 Obsidian 不把它當 tag/alias 用，或外部 validator 因型別不符報錯，兩邊都不會明顯提示是同一欄位打架。

### 34. 衝突焦點二：連結格式（wikilink vs 標準 markdown link）

**運作方式**：obsidian-markdown/SKILL.md:19、21-29。Obsidian 的第一等公民是 `[[wikilink]]`（以筆記名解析、改名自動追蹤、支援 `#heading`/`#^block`/`|alias`）；SKILL.md:19 建議外部 URL 才用 `[text](url)`。但外部 markdown 規範（CommonMark/GFM/靜態網站產生器/其他 schema）通常只認 `[text](path)` 且要求副檔名與相對路徑。wikilink 在那些環境不會被解析，`[[Note#^block-id]]` 更是完全外部不相容。

**移植/意義**：純 markdown 記憶系統若要同時被 Obsidian 與外部工具消費，必須在『內部關聯用 wikilink（LLM/人在 Obsidian 內導航最順）』與『可攜性用標準連結（外部工具可解析）』間抉擇。折衷方案：內部記憶關聯堅持 wikilink 換取自動改名追蹤與 block 級定址，發布/匯出時再用轉換器把 wikilink 降級成標準連結。

**採用**：是　**注意**：block reference `#^block-id` 與 heading embed 幾乎沒有外部等價物，是可攜性的硬邊界——依賴愈深，愈難脫離 Obsidian。

### 35. 衝突焦點三：檔名 / 筆記識別規則

**運作方式**：obsidian-cli/SKILL.md:31-36 揭示 Obsidian 的識別模型：`file=<name>` 以『純名稱（不含路徑或副檔名）像 wikilink 一樣解析』，`path=<path>` 才是 vault root 精確路徑。即 Obsidian 的內部連結/CLI 定位以『筆記名』為主鍵而非路徑，這隱含名稱在可解析範圍內需唯一且允許空格（SKILL.md:16 特別示範用引號包含空格的名稱）。外部 schema 常反過來要求：kebab-case、無空格、日期前綴、slug 唯一、或副檔名參與識別。

**移植/意義**：對 PARA（靠資料夾/路徑組織給人）+ 記憶宮殿（靠名稱/wikilink 給 LLM）的雙軸系統，這是結構性張力：Obsidian 想要人類可讀、含空格、以名稱為鍵；外部規範想要 URL-safe slug、以路徑為鍵。若外部 schema 強制檔名格式，會削弱 wikilink 的自然度（顯示文字得靠 `|alias` 補救）並可能造成同名衝突。

**採用**：是　**注意**：wikilink 以名稱為鍵意味著全 vault（或至少可解析範圍）筆記名需可區分；外部強制的 slug 前綴（如時間戳）可保證唯一，卻讓 `[[...]]` 變得冗長難讀，兩個目標直接對立。

### 36. (問題1) mdcode = 「Metadata as Code」：把 Knowledge Catalog (Dataplex) 的 metadata 表示成可版本控制的 source-code artifacts（YAML + markdown），並與後端 catalog 服務雙向同步。

**運作方式**：toolbox/README.md:5-7 與 mdcode/README.md:1-14 定義它。一個目錄 = 一份 catalog 的本地快照：根目錄有 manifest `catalog.yaml`（scope/aliases/snapshot/publishing），`catalog/` 下每個 entry 一個 `.yaml`（mdcode/README.md:18-30）。核心 API 是 `CatalogSnapshot.fromPath()` + `pull()`/`push()`（mdcode/README.md:112-131），發佈為 TS/Python lib、`kcmd` CLI、以及 MCP server（pull/push/list-entries/lookup-entry/modify-entry，README.md:185-194）。它解決的問題（concept.md:1-27, spec.md:5-10）：讓 data steward / producer / AI agent 能用開發者工作流（diff、code review、git、CI/CD、context 版本化）來管理與豐富化 metadata，而非用 GUI 點按。

**移植/意義**：這正是你要做的「純 markdown 記憶系統」的權威先例——把知識當程式碼、用 git 管、讓人與 agent 共用同一批純文字檔。差別：mdcode 有一個外部服務當第二真相來源，所以背了 pull/push/conflict/checksum 的複雜度；純 markdown 記憶系統可把檔案本身當唯一真相來源，直接砍掉整個 sync 半邊，簡單很多。

**採用**：是　**注意**：不要照抄雙向同步機制——那是為了對接 Dataplex 服務而存在，對純本地 markdown vault 是純負擔。

### 37. (問題1，最該偷) 依 scope 自動選 layout：Standard Layout（YAML 主檔 + markdown sidecar）vs Documents/`kb` Layout（單一 .md：結構化 metadata 進 YAML frontmatter、主要 overview 內容升為 markdown body）。

**運作方式**：concept.md:160-191 定義兩種 layout；`kb` scope 用 Documents Layout（concept.md:179-191, 380-431, spec.md:20 與 3.1 節 spec.md:31-33）：`<entry-id>.md` = frontmatter 放 id/type/resource/schema/其他結構化 aspect，body 放 `overview.content` 這段人讀 prose。Standard Layout 則把非結構化 aspect 拆成 `<entry>.overview.md` sidecar（concept.md:334-378）。

**移植/意義**：這直接命中你的雙受眾架構——一個 .md 檔同時服務人與 LLM：frontmatter = 給機器/查詢/PARA 分類的結構化欄位，body = 給人讀的敘述。你的「PARA 給人 + 記憶宮殿給 LLM」可以就是這個 Documents Layout：frontmatter 承載記憶宮殿的座標/連結/型別，body 是人可讀的知識點。不需要發明新格式。

**採用**：是

### 38. frontmatter 用 `userManaged` 旗標區分「人手寫、不可被 agent 覆寫」vs「agent 生成、可再生」，並在 frontmatter 承載 `links`（title+url 引用）。

**運作方式**：concept.md:558-575 的範例：`orders.overview.md` frontmatter 有 `userManaged: true` + `links:`（外部引用清單），而 `orders.guidelines.md` 有 `userManaged: false`。concept.md:372-378, 416-420 也把 links 放進 frontmatter/aspect metadata。

**移植/意義**：對 LLM 維護的記憶系統極關鍵：需要一個 per-node 旗標告訴 LLM「這個節點是人 pin 住的、只能讀不能改」vs「這是你自己生成的、可自由重寫」。否則自動豐富化會踩掉人手寫的內容。`links` 進 frontmatter 也給你現成的「記憶宮殿節點間交叉引用」欄位設計。

**採用**：是

### 39. tool state 與 user content 分離：checksum 存在獨立 state 檔（`.catalog.state`），不污染內容檔；用 checksum 做衝突偵測與 fail-fast。

**運作方式**：spec.md 3.7（59-64）明訂 checksum 存 separate state file；3.3 Conflict Handling（40-44）：push 前若偵測後端在期間被改過就 abort 並要求先 pull（可 --force 覆蓋）；3.8（62-64）用 state 對比缺檔判定刪除意圖。

**移植/意義**：若你的記憶系統要讓 LLM 判斷「這個記憶自我上次讀取/寫入後是否被人改過」，可用同樣手法：把 checksum/last-seen 之類的 agent 狀態放到 sidecar 或 `.state` 檔，保持 markdown 內容檔乾淨、diff 友善。這是「不要把機器狀態塞進人讀檔」的好紀律。

**採用**：是

### 40. (問題2) Enrichment agent 架構：per-entry 迴圈，每個知識節點各起一個乾淨的 single-shot ADK agent（Gemini 2.5 Flash，開 thinking），跑完就丟。

**運作方式**：agent/main.ts 只是 CLI 殼，委派給 enrich/command.ts。command.ts:42-112 對 `catalog.listEntries()` 逐一迭代；每個 entry 動態建立 `update_documentation` FunctionTool（command.ts:51-75）→ `createAgent([updateTool, ...mcpTools, ...skills])`（command.ts:77）→ `InMemoryRunner.runEphemeral(...)`（command.ts:78-89）跑一次。agent 定義在 agent.ts:89-108：Gemini 2.5 Flash、vertexai、`thinkingConfig.includeThoughts + thinkingBudget:-1`（無上限思考）。

**移植/意義**：「一次豐富化一個記憶節點、每次乾淨 context」是你 LLM 維護記憶的可直接套用骨架。逐節點獨立 run 避免 context 互相污染、也讓每個節點的豐富化可並行/可重跑。

**採用**：是

### 41. (問題2 核心) 豐富化迴路 = 讀既有 → 檢索外部來源 → 抽取 → 只合併「淨新增」資訊並保留既有 → 自我複審 → 呼叫單一 write tool；沒新資訊就跳過不寫。

**運作方式**：整個迴路寫死在 agent.ts:63-85 的 PROMPT workflow：Step1 理解既有 metadata（名稱/description/schema/既有文件）；Step2 formulate search queries → 搜來源 → 抽取 → 「update the documentation with meaningful net new information while preserving the relevant bits of existing information」+ 更新 citations，且「若沒找到額外資訊就輸出 no info、不更新、跳過後續」（agent.ts:76-79）；Step3 複審讓文字精簡無歧義；Step4 呼叫 `update_documentation`。餵給 agent 的 context 由 command.ts:116-140 `createPrompt` 組出：注入 schema JSON + 既有 overview（或標記無既有文件）。

**移植/意義**：這就是「LLM 維護記憶」的教科書迴路。可直接抄的規則：(a) 先讀既有記憶再動筆；(b) 只寫 net-new、保留既有（避免破壞性覆寫）；(c) 沒新資訊就不寫（避免無意義 churn / 抖動）；(d) 寫前自我複審。你的記憶維護 agent 幾乎可照這四步。

**採用**：是

### 42. 讀寫分離 + 單一結構化寫入口：agent 不能直接改檔，只能呼叫唯一的 `update_documentation` FunctionTool，寫入 `overview` aspect；所有讀取靠另一組（fileset MCP）工具。

**運作方式**：command.ts:51-75 動態建立 `update_documentation`（參數只有 `documentation: STRING(markdown)`），execute 把內容寫進 `entry.aspects['dataplex-types.global.overview']` 並 `catalog.updateEntry(...)`。讀取來源工具則完全獨立（md-fileset MCP，見下）。

**移植/意義**：對記憶系統很有價值：把 LLM 的「寫」收斂成一個受控、結構化的入口，而非放它任意 edit 檔案。這樣你能在該入口掛 validation（frontmatter schema 檢查、markdown lint、userManaged 保護、size 限制）再落盤。是安全地讓 LLM 自維護 vault 的關鍵閘門。

**採用**：是

### 43. (問題2) 來源可插拔：外部知識來源以 MCP server（`mcp.json`）+ ADK Skill（`SKILL.md`）動態載入，agent 本體不綁死任何特定來源。

**運作方式**：agent/tools.ts:16-67 `loadMcpTools` 讀 `tools/mcp.json`，支援 stdio(command/args/env)與 httpUrl，並對 command/args/env 做 `$VAR`/`${VAR}` 展開（tools.ts:9-14）；tools.ts:69-92 `loadSkills` 用 `adk.loadAllSkillsInDir` 從 `tools/skills/*/SKILL.md` 載入、配 `UnsafeLocalCodeExecutor`。command.ts:36-37 在跑之前載入兩者、與 write tool 一起交給 agent。demo 的 SKILL.md（enrichment/README.md:130-155）描述「怎麼用這個來源」並教 agent 檢索策略。

**移植/意義**：你的記憶宮殿要接多種來源（本地 vault、web、其他 repo、Obsidian）時，這個「MCP 接來源 + SKILL.md 教怎麼用來源」的雙層 pattern 可直接沿用。SKILL.md 本質是 progressive-disclosure 的檢索 playbook——正對應記憶宮殿需要一份「如何在宮殿裡找路」的指引 prompt。

**採用**：是

### 44. (問題3 最實用) md-fileset MCP：對一個 markdown 目錄樹只暴露 list / search / read 三個工具，search 回傳 file+line+snippet，並教 agent「先 search 再 read」以省 token。

**運作方式**：tools/md/server.ts:31-62 註冊三工具：`list_fileset_contents`(瀏覽目錄樹)、`search_fileset_contents`(regex，回 file/line/content 三元組)、`read_fileset_file`(讀全文)。實作在 fileset.ts：`searchContents` 逐檔逐行套 regex 回 `{file,line,content}`（fileset.ts:75-124，SearchResult 型別 7-11），只掃 `.md`（getMarkdownFiles 59-73）；`safePath`(23-31) 做路徑逃逸沙箱。SKILL.md（enrichment/README.md:148-154）明確指示 agent「用簡單關鍵字查詢先定位、再讀檔，一組不中就換關鍵字」，避免 list+read 全部檔案。

**移植/意義**：這幾乎就是你的記憶宮殿的最小 LLM 存取介面：list（看宮殿結構）→ search（grep 定位到 file:line）→ read（只讀命中的節點）。search 先回 snippet+行號讓 agent 先定位再精讀，是純 markdown 大 vault 下 token-efficient 檢索的關鍵設計。可直接照抄成你的記憶讀取工具三件組。

**採用**：是　**注意**：search 只做逐行 regex（無語意/模糊檢索、無跨行/區塊感知），大 vault 或需要概念檢索時要自己加 embedding/BM25 那層。

### 45. (問題3) 文件模板明確「同時為人與 agent 優化」：prose 摘要（給人）+ 固定 section/bullets（給 agent 檢索）+ Citations（給溯源），且要求 synthesize 而非複製、用事實化語言避免 may/likely。

**運作方式**：agent.ts:11-61 的 PROMPT：定位「optimize for both humans and agents」（22-25），模板為 幾段摘要 + `## Data Details` + `## Usage Details` + `## Citations`（46-61）；規則要求 comprehensive-yet-compact、不得複製既有 metadata 要 synthesize（30-33）、只用有依據的事實、避免 'may/likely/could' 等模糊詞（38-41）、務必附 citations（44）。

**移植/意義**：直接對應你「PARA 給人 + 記憶宮殿給 LLM」的雙受眾目標——示範一個檔案如何同時滿足兩者：頂部 prose 給人快讀、中段結構化 bullets 給 agent 命中檢索、Citations 讓每個記憶節點可溯源。特別是「每筆記憶都要帶來源引用」與「synthesize 不要 verbatim 複製」兩條，對可信、可維護的 LLM 記憶庫是必備規範，建議寫進你的記憶寫入 contract。

**採用**：是

### 46. Discovery agent 展示的核心模式：query decomposition + scatter-gather (fan-out) + dedup + rerank 的檢索編排。單一 LLM agent 只配一個工具 knowledge_catalog_search(query),但透過指令把「一個問題」放大成多路平行檢索,再收斂。

**運作方式**：agent.py:24-35 只是一個 llm_agent.Agent,綁一個工具 tools.knowledge_catalog_search;真正的智慧全在 SKILL.md 指令裡。SKILL.md Step2 (49-57) 要 LLM 做 semantic decomposition,產出最多 3 個 distinct 變體(直接同義詞 / 資料庫術語翻譯 / 更廣類別),外加 Step3 (60-67) 強制附上『Baseline Search = 逐字原句』。Step3 要求盡量 parallel batch 以省 round-trip;Step4 (79-82) 用 entry name 去重;Step5 (84-91) 依 intent 重排並過濾、只回最相關的。tools.py:38-45 底層是 dataplex search_entries(semantic_search=True, page_size=50)。

**移植/意義**：這正是個人記憶系統『retrieval』層可直接偷的模式:不要只做一次語意相似度比對。把使用者一句模糊查詢拆成多個查詢視角(原句 + 同義詞 + 領域術語翻譯 + 上位概念),平行去 markdown 記憶庫撈,再由 LLM 去重、重排、過濾。對『記憶宮殿給 LLM』特別契合——LLM 自己當 query planner + reranker,底層 grep/語意檢索只要笨笨地回候選。

**採用**：是　**注意**：它依賴雲端語意搜尋 API;個人 markdown 系統要自備 embedding 或退化為多次 grep。scatter-gather 會放大 token/呼叫成本,小型 vault 未必划算。

### 47. SKILL.md 作為『agent 指南』的文件結構本身就是可複製的範本:frontmatter 契約 → persona+行為偏誤 → 領域知識參照 → 編號步驟 SOP → 單一真理表(reference table) → few-shot 範例。

**運作方式**：discovery/SKILL.md 的分層:(1) YAML frontmatter name/description (1-7) 供 AgentTool 註冊時當『何時用我』的路由描述;(2) persona + 強行為偏誤 (9-11)『Always assume you can help. Never start by saying I cannot...』直接壓制 LLM 的推諉傾向;(3) About 段 (15-38) 教語法與 CRITICAL ARGUMENT RULE;(4) 編號 Instructions Step1-5 (40-91) 是可稽核的 SOP;(5) Predicate Reference Table (139-169) 明示『single source of truth』並禁止發明新謂詞;(6) Examples (171-192) 大量 input→output 對照。全篇用 MUST / CRITICAL / REMINDER 大寫 + 重複關鍵約束(projectid 必須進 query 字串重複三次)。

**移植/意義**：這份 SKILL.md 是『把 LLM 行為寫成 markdown 契約』的教科書級樣本,直接對應你系統裡『記憶宮殿給 LLM』那半:給 LLM 的操作手冊應該長這樣——frontmatter 當觸發路由、numbered SOP 當可稽核流程、reference table 當封閉詞彙表(避免 LLM 亂造 tag/分類)、few-shot 當對齊。你的記憶系統若要有『如何歸檔 / 如何檢索』的 LLM 指南,可照這骨架寫。

**採用**：是　**注意**：這份檔案有明顯瑕疵可當反面教材:出現兩個『Step 3』(60 與 68 標題重複)、Predicate Table 缺 system 之後的斷行、typo,顯示這類長指令難維護、易漂移。偷結構、別偷它的一致性缺陷。

### 48. Prompt-as-file / instruction-from-markdown 模式:agent 的系統指令不寫死在程式碼,而是從獨立 SKILL.md / agent.md 檔案讀入,程式碼只負責組裝。

**運作方式**：discovery/agent.py:14-21 定義 SKILL_FILE_PATH 並 load_instruction() 直接 read SKILL.md 全文塞進 instruction=(31)。enrichment 更進一步:documentation/agent.py:20-21 用 markdown.parse() 把 agent.md 拆成 frontmatter(params)+body(instruction),frontmatter 的 model/thinking/description 直接驅動 LlmAgent 設定(33-40),thinking:true 時掛上 BuiltInPlanner+ThinkingConfig(23-30)。util/markdown.py:8-18 是極簡 20 行 frontmatter parser(--- 分隔 + yaml.safe_load)。

**移植/意義**：對純 markdown 記憶系統是關鍵背書:markdown+frontmatter 足以同時當『人可讀文件』與『機器可執行設定』。你的系統可讓每個 agent 行為、每條記憶策略都是一份 .md,frontmatter 放結構化參數(model、觸發條件、優先級),body 放自然語言指南——人用 PARA 瀏覽、LLM 用 frontmatter 路由,同一份檔案兩用,零 schema 遷移成本。

**採用**：是

### 49. Enrichment 的四段式 human-in-the-loop 管線:download → enrich → review(git diff) → publish。把 metadata 落地成本機 markdown 檔案,讓『AI 產生的變更』先變成可 diff、可審、可回滾的檔案,再選擇性發布。

**運作方式**：README.md:60-89 四步:download.py 把 catalog 抓成本機 markdown snapshot(--dir metadata.initial);enrich.py 讀 --dir 產出到 --output-dir metadata.new;審查步驟直接用 `git diff --no-index metadata.initial metadata.new`(80-82)——用 git 當 review UI;publish.py 才寫回 catalog。enrich.py:57-61 output-dir 可選,不給就 in-place。snapshot.download_entries/publish_entries(snapshot.py:63-127) 負責 catalog↔markdown 雙向轉換。

**移植/意義**：這是個人記憶系統『安全 enrichment』的黃金流程。LLM 對記憶的每次改寫都應該:(1) 先 snapshot 現況 → (2) 產生新版到旁邊 → (3) git diff 給人審 → (4) 人核可才 commit/發布。你的 vault 本來就是 markdown+git,天生支援這條管線。關鍵洞見:AI 改記憶不要直接覆寫,要走『提議變更→人 diff→採納』,git 就是現成的 review/rollback 機制。

**採用**：是

### 50. 記憶/metadata 以『一個資產一個 markdown 檔 + frontmatter』儲存,frontmatter 放身分/指標(name、resource),body 放人類可讀的 Overview。這就是把資料庫 aspect 攤平成 PARA 式檔案樹。

**運作方式**：snapshot.py:_entry_to_md (19-36) 把一個 catalog entry 序列化成 `--- name/resource --- # table_name ## Overview <content>`,存成 `{table_name}.md`(104-107)。_md_to_entry (39-60) 反向解析,只從 `## Overview` 段抽回內容。update_entry (133-141) 更新時只換 Overview content 再重寫檔案。list_entries (130-131) 就是 glob('*.md') 取檔名。整個『資料庫』在 enrich 階段其實就是一個 markdown 目錄。

**移植/意義**：直接驗證你的架構選型:markdown 檔案樹足以當結構化知識庫的載體。frontmatter=機器欄位(id/來源/連結),固定 heading(## Overview)=語意分區,檔名=主鍵。PARA 給人的目錄結構與『每檔一資產』完全相容。可偷:用固定 heading 當『LLM 可尋址的記憶槽位』(如 ## Overview / ## Links / ## Provenance),讓 LLM 精準更新某一段而非整檔重寫。

**採用**：是

### 51. 『產出走工具而非走對話』:enrichment agent 被明令不得把 markdown 直接吐給使用者,必須呼叫 update_table 工具發布。讓副作用結構化、可攔截、可寫檔。

**運作方式**：agent.md:25-27『Do not directly output the markdown content to the user. Instead, use the update_table tool to publish...』。update_table 在 enrich.py:69-83 定義為 closure,內部呼叫 snapshot.update_entry 寫檔並回成功/失敗訊息;create_runner('agent', [update_table], config_dir)(86) 把它當工具注入。等於 LLM 的『最終答案』是一次工具呼叫,而非自由文字。

**移植/意義**：個人記憶系統的寫入路徑應照此設計:LLM 不該用『我建議你這樣記…』的散文結尾,而該呼叫 append_memory / update_note(slot, content) 這類工具,由工具負責格式化、去重、寫進正確檔案/heading。好處:寫入格式一致、可加驗證(拒絕臆測內容)、可記 provenance、與對話解耦。

**採用**：是

### 52. 可插拔的 context sources:agent 的能力=固定核心指令 + 使用者可換的三件套(instructions.md 自然語言策略 + mcp.json 工具 + skills/ 技能),由 config-dir 在啟動時組裝。

**運作方式**：documentation/sources.py:load_sources_config (74-94):instructions.md 存在就 format 進核心指令的 {user_instruction} 佔位(75-78);mcp.json 解析成 McpToolset 併入 tools(82-87,支援 stdio 與 httpUrl 兩型);skills/ 目錄下每個子目錄 load_skill_from_dir 組成 SkillToolset(88-92)。agent.md:52-54 核心指令尾端留 {user_instruction} 讓組織策略注入。sample/config/instructions.md 只有 4 行:『用本地 markdown 知識庫,一定要查這些來源』。

**移植/意義**：這是『核心 vs 使用者可調』的乾淨分層,適合搬進記憶系統:系統內建一份不可變的『如何歸檔/檢索』核心指南,外加使用者可編輯的 instructions.md(我的偏好、我的分類慣例、優先來源)、mcp.json(接我的其他資料源)、skills/(自訂檢索技能)。使用者不改核心、只改注入層,升級不衝突。

**採用**：是

### 53. fileskb:一個把純 markdown 目錄暴露成 retrieval 工具的極簡 MCP server,只提供 list / read / search 三個工具——正好是 LLM 檢索檔案樹所需的最小集合。

**運作方式**：tools/fileskb/main.py 用 FastMCP 定義三工具:list_contents (27-43) 列目錄(輸出 name|relpath|type);read_file (46-58) 回整檔內容;search_content (61-102) 對所有 .md 跑 re.IGNORECASE regex,回 [{file,line,content}] 附行號與行片段。_safe_path (17-24) 用 resolve()+startswith(KB_ROOT) 防目錄穿越。對應 SKILL kb-search(sample/config/skills/kb-search/SKILL.md)教 LLM『先 search 定位、再 read 精讀,不必全列全讀』。

**移植/意義**：這就是『記憶宮殿給 LLM』的檢索介面藍本:不需要向量 DB,三個工具(list 導航 / search 定位 / read 精讀)就能讓 LLM 在 markdown vault 上做 agentic retrieval。search 回行號讓 LLM 能精準跳讀省 token。可直接對應 obsidian-cli / grep 封裝。SKILL 明示的『search-then-read』策略是省 context 的關鍵習慣。

**採用**：是　**注意**：search 只是逐行 regex,無語意能力、無 ranking、大 vault 會慢且回傳爆量;需自加結果上限或語意層。_safe_path 用字串 startswith 判斷,邊界情境(同前綴目錄名)理論上可繞,個人用途影響小。

### 54. 『好記憶條目』的品質規範被寫成明文 rubric,並強制附引用(citations)、禁止臆測。把『什麼是好文件』變成 LLM 可遵循的驗收標準。

**運作方式**：agent.md:29-49『Good Documentation Details』列出:comprehensive 但 compact(幾段就好)、不重複既有 description、不逐字複製抽取內容要重新組織、只用提供的來源不得臆測、禁用 may/likely/could 這類模糊語、沒有有用資訊就明說、格式為 markdown、必須含 citations 列表。Workflow(10-27)還內建 step3『依此標準自我 review 再改進』的自省環。catalog.py:_format_description/_format_schema(20-59)先把 schema+descriptions+overview 三層 aspect 組成緊湊 context 餵給 agent。

**移植/意義**：個人記憶系統最該偷這條:為『記憶條目』定義明文品質 rubric 並讓 LLM 寫入前自我 review。重點原則—(1) 不重複既有內容(去冗餘,避免記憶膨脹);(2) 只依來源、禁臆測、禁模糊語(記憶要可信);(3) 一律附 provenance/citations(來源可追溯);(4) compact 優先(記憶宮殿要精簡好檢索)。這直接解決 LLM 自動記憶最大風險:幻覺與無限膨脹。

**採用**：是

### 55. 分層 metadata / aspect 模型:同一資產的知識拆成 schema(結構事實)/ descriptions(欄位說明)/ overview(AI 生成敘述)三個獨立 aspect,enrichment 只動 overview 這層。

**運作方式**：catalog.py:10-17 定義三組 aspect 常數(schema/descriptions/overview);lookup_table_info (62-110) get_entry 時同時拉三層,組成給 agent 的 context(97-109)。但 enrichment 寫回時只更新 overview aspect(snapshot.py:update_entry:138 只改 OVERVIEW content;publish_entries:119-125 的 update_mask 只含 aspects+aspect_keys=[OVERVIEW])。等於:底層事實(schema)唯讀當輸入,AI 敘述層(overview)才是可寫的 enrichment 產物。

**移植/意義**：對記憶系統的分層設計有啟發:把一則記憶拆成『硬事實層(來源原文/連結/時間,唯讀)』與『LLM 敘述/摘要層(可再生成、可覆寫)』。人的 PARA 看敘述層,系統可隨時用硬事實層重新 enrich 敘述層而不破壞來源。frontmatter=硬事實,body 的摘要段=可重生的 AI 層,兩層分離讓『重新整理記憶』安全。

**採用**：是

### 56. 整體哲學(repo README):Knowledge Catalog 把自己定位為『給 AI agent 的語意層/business context 層』,並明確把解法拆成三支柱—context management、enrichment、retrieval。metadata 本身就是產品。

**運作方式**：頂層 README.md:3-6 明述『dynamic knowledge graph... to provide semantics and business context to AI agents』且『building context management, enrichment and retrieval solutions』。samples/README.md:1-15 對應兩個示範:discovery=retrieval(建在 Search API 上),enrichment=context management/enrichment(生成並發布文件當 metadata)。兩者共用同一套 markdown+frontmatter 表徵與 catalog 後端,形成閉環:enrichment 產生的 overview 文件 → 提升 discovery 的語意搜尋品質。

**移植/意義**：這三分法可直接當你記憶系統的頂層架構語彙:『context management(記憶如何組織/落地成檔)+ enrichment(如何自動補充、摘要、交叉連結)+ retrieval(如何多視角撈回)』。核心哲學=metadata/記憶不是副產物而是一等公民,且 enrichment↔retrieval 形成正回饋(寫得越好→找得越準→再 enrich 越省力)。PARA 對應 context management(人的組織),記憶宮殿對應 enrichment+retrieval(LLM 的補充與檢索),三者是同一閉環的三面。

**採用**：是

