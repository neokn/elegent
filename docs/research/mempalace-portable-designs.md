# MemPalace → 純 Markdown 記憶系統：可移植設計清單

**目標架構前提**：雙層儲存 —— (1) **Raw 層**：逐字 transcript 歸檔（verbatim，不切塊、不摘要）；(2) **Wiki 層**：LLM 蒸餾出的「編譯式 wiki」（entity notes、topic notes、索引）。無向量檢索。以下每項標注：(a) 原始實作重點、(b) markdown 移植方案、(c) 採用/捨棄與理由。

---

## 總體對應表（先看這張）

| MemPalace 概念 | 移植目的地 | 判定 |
|---|---|---|
| Drawer（verbatim chunk） | Raw 層 `.md` 檔（整份，不切塊） | 改造採用 |
| Wing | 頂層資料夾（slug 正規化） | 採用 |
| Room（topic 軸） | Wiki 層子資料夾／`room:` frontmatter | 採用（拆軸） |
| Room（time 軸，daily） | Raw 層 `YYYY-MM-DD` 檔名慣例 | 採用（拆軸） |
| Hall | 一個 tag（或不做） | 捨棄 |
| Closet / AAAK 索引 | `index.md` 一行一指標 + wikilink | 採用（核心） |
| AAAK dialect 編碼 | 不移植格式本身；只移植「規範即 prompt」手法 | 大部分捨棄 |
| Passive/Explicit/Auto tunnels | wikilink + backlinks + 產生式 MOC | 合併簡化 |
| L0/L1（wake-up） | `identity.md` + `essential-story.md`，SessionStart 注入 | 採用 |
| L2 | 按資料夾/tag 按需載入 | 採用 |
| L3（語意搜尋） | 降級為 grep/全文檢索 | 捨棄語意、保留介面 |
| Hooks（Stop/PreCompact/SessionEnd） | 幾乎照抄骨架，動作換成「render markdown」 | 採用 |
| Temporal KG + Entity registry | Wiki 層 entity note + 時間性事實表 | 採用 |

---## 一、結構與命名

### 1. 扁平 metadata 模型（非目錄樹）
- **(a) 原始實作**：整座 palace 是單一 ChromaDB collection，Wing/Room/Hall 全是 drawer 的扁平 metadata 字串（miner.py:1259-1281）；階層是查詢時 GROUP BY 出來的，主鍵 `drawer_{wing}_{room}_{hash24}` 用字串編碼階層（ids.py:56-68）。
- **(b) 移植**：這給了你選擇權——不必模仿任何樹。建議：**資料夾承載 Wing×時間（Raw 層）與 Wing×主題（Wiki 層），其餘結構全放 frontmatter**（`wing:`、`room:`、`hall→tags`、`source:`、`filed_at:`）。資料夾是「主要瀏覽軸」，frontmatter 是「其餘所有軸」，用 Dataview/Bases 做 GROUP BY。
- **(c) 判定：採用（觀念層面）**。這是整份研究最重要的 reframing：階層即標籤、視圖即查詢。但注意 caveat——原系統的召回靠語意向量搜尋，純 markdown 版必須由「索引層（第 5 項）＋全文檢索」完全接手，這是全案最大的功能退化點，要在設計文件明示。

### 2. Wing 命名正規化
- **(a)**：wing 來自 `mempalace.yaml` 或專案目錄名，一律過 `normalize_wing_name()`（小寫、空白/`-`→`_`、去頭尾 `_`，config.py:34-46）＋ `sanitize_name()`（擋 `..`/`/`/null，config.py:49-74），寫入與查詢兩端都套同一規則。
- **(b)**：Wing → 頂層資料夾，**照抄同一套 slug + sanitize 規則**產生資料夾名與連結目標。全系統唯一真理：任何寫入 wing 的地方都先過這個函式。
- **(c) 判定：採用，一字不改**。這是全系統最乾淨的 1:1 映射，也是第 9 項 passive tunnel 能成立的前提（跨 wing 連結靠字串精確相等，正規化就是防呆）。

### 3. Room 的雙軸衝突 → 明確拆軸
- **(a)**：room 一詞混用兩個正交軸：topic 路由（資料夾/檔名/內容關鍵字打分，miner.py:464-503）與 time 路由（diary 的 `room='daily'`+`date`，diary_ingest.py:141-192）。原系統只有 daily 層可靠地帶 `date`，這是研究中點名的設計混淆。
- **(b)**：**用雙層架構天然化解**：Raw 層一律按時間組織（`raw/<wing>/YYYY-MM-DD_<session_id>.md`，diary 慣例 1:1 照搬）；Wiki 層一律按主題組織（`wiki/<wing>/<room>/`）。關鍵字路由表（`{room: [keywords]}` YAML + 「資料夾>檔名>內容、先中先贏」優先序）照抄，作為蒸餾時的自動歸檔規則。
- **(c) 判定：採用（拆軸後）**。不要讓同一個資料夾層級同時代表主題與日期——雙層儲存正好一層一軸，這是本清單對原設計的最大修正。

### 4. Hall（內容型態分類器）
- **(a)**：固定 hall→關鍵字表打分取 argmax（config.py:248-304, miner.py:860-882），存為扁平 `hall` 欄位。
- **(b)**：若要保留，就是一個 nested tag（`#hall/technical`）＋同一張關鍵字表在 ingest 時自動打。
- **(c) 判定：捨棄獨立概念**。研究已指出 hall 的價值 ≈ 一個 tag；在 Obsidian 中 tag + graph filter 完全涵蓋。保留固定 emotional/technical 分類法只會多一套要維護的詞表。若日後需要，隨時可用 tag 補回，無遷移成本。

---

## 二、索引層（雙層策略的心臟）

### 5. Closet pointer 四段式索引行
- **(a)**：生產級索引 = 每個來源檔多條原子指標行 `topic|entities|YYYY-MM-DD:Lstart-Lend|→drawer_ids`（palace.py:539-624），貪婪打包進 ≤1500 字的 closet、行不跨檔（palace.py:681-718）。LLM 掃指標、只開命中的 drawer。
- **(b)**：這是**全案最值得偷的單一設計**。每個 wing（或 room）一份自動生成的 `index.md`：一行一指標 `- 主題短語 | 實體;實體 | YYYY-MM-DD | →[[raw/…#^blockid]]`，目標欄從 drawer id 換成 wikilink/block ref。抽取規則（動作動詞開頭主題、≥2 次專有名詞、最多 3 個目標）寫成規範文字。行號定位（`#Lstart-Lend`）改用 Obsidian block anchor——純 markdown 檔的行號會因編輯漂移，block `^id` 不會。
- **(c) 判定：採用（核心元件）**，但依 caveat 做一個關鍵替換：**原版 regex/頻率抽取產生噪音指標，改由 LLM 在 wiki 蒸餾時生成索引行**。你的系統本來就有 LLM 蒸餾步驟，索引行就是蒸餾產物之一，品質天然高於 regex。同時牢記 recall 代價（見第 8 項）。

### 6. AAAK dialect 行格式（Header/Zettel/Tunnel/Arc）
- **(a)**：有損結構化摘要，`|` 分欄、實體 3 字碼、情緒碼表、flags 關鍵字觸發（dialect.py:20-24, 703-732）；與 closet 行共用同一索引 collection。
- **(b)**：理論上可直接當索引檔行規範（純文字、零依賴）。
- **(c) 判定：捨棄格式本身**。理由：**與第 5 項重複**——兩者是同一索引層的兩種方言，移植只需要一種，而 closet 四段式帶日期+定位、更接近「指標」語意；AAAK 的實體 3 字碼在大 vault 必撞碼（需另養 entities.json）、`|` 與 markdown 表格衝突、emoji/星號不利 grep、情緒/flag 關鍵字比對跨語言失效。AAAK 想解的「壓縮」問題你用 wikilink 就解了。
- **例外保留**：AAAK_SPEC 的**手法**——「格式規範本身就是 prompt，貼在索引檔頂端，LLM 讀規範即會讀寫」（mcp_server.py:1536-1553；i18n 四句版 en.json:36）。為你的第 5 項索引行寫一份 `INDEX-FORMAT.md`，開頭放 4 句 TL;DR，這是最省力的「規範即 prompt」移植路徑。

### 7. Index/Verbatim 分離 + 三重掃描上限
- **(a)**：closets 存極短指標、drawers 存全文；上限：1500 字/closet、L1 硬限 15 則/3200 字、MAX_SCAN=2000（layers.py:81-123）。
- **(b)**：你的雙層架構就是這個模式的放大版：`index.md`（可分片，每片 ≤1500 字元）→ 指向 Raw 層全文。加一份 `wake.md` 套同樣硬上限（≤15 條、≤3200 字元）。**把上限數字直接寫進規範文件**，讓維護索引的 LLM 有可驗證的約束。
- **(c) 判定：採用**。這是「LLM 掃數千條目不爆 token」的答案，與第 5 項是同一設計的兩面。

### 8. 壓縮率宣稱與召回代價
- **(a)**：「30x lossless」已被作者勘誤撤回（docs/HISTORY.md:87-99）；AAAK 有損、小規模甚至變大；索引掃描模式 R@5=84.2% vs 語意搜尋 96.6%。
- **(b)**：規範不承諾壓縮率，改為可驗證長度約束（每指標行 ≤120 字元、每分片 ≤1500 字元）。
- **(c) 判定：捨棄任何壓縮率/召回率宣稱**。你的系統連語意搜尋都沒有，索引漏召回只會更明顯——設計文件應明寫：「索引是近似定位器；miss 時 fallback 到全文 grep」。這是誠實的降級路徑，不是缺陷掩蓋。

---

## 三、連結層（三種 tunnel 合併簡化）

### 9. Passive tunnels（同名 room 跨 wing = 橋）
- **(a)**：零儲存——同一 room 字串出現在 ≥2 個 wing 即成 tunnel，讀取時重算＋60s cache（palace_graph.py:90-292）。
- **(b)**：**在 Obsidian 是免費的**：跨 wing 共用同一 topic note 標題（或 `#topic/x` tag），backlinks + graph view 即是 build_graph + traverse。唯一要做的事：命名紀律——所有 room/topic 名過第 2 項的同一 slug 函式，必要時用 `aliases:` 收攏變體。
- **(c) 判定：採用（零程式碼）**。caveat 是精確字串相等的脆弱 join——原系統反覆修 hyphen/underscore bug 就是教訓，slug 正規化必須是寫入路徑的強制步驟，不是建議。

### 10. Explicit tunnels（JSON sidecar + 對稱去重 + dynamics）
- **(a)**：`tunnels.json` sidecar、無向 canonical ID、原子寫入、strength/access_count 動力學欄位（palace_graph.py:332-604）。
- **(b)**：wikilink 天生無向（backlinks 補反向），對稱去重機制整個不需要；帶 label 就寫 `[[auth]] — 共用 session 模型` 行內說明，或 `related:` frontmatter。
- **(c) 判定：捨棄機制、保留意圖**。整套 canonical-ID/atomic-write/dedup 是為「沒有雙向連結的儲存」補課，markdown 原生就有。dynamics 欄位依 caveat 明確不移植——需要腳本維護 frontmatter 計數器，wiki 場景收益趨近零。

### 11. Auto topic/entity tunnels（門檻式自動連結）
- **(a)**：wing-pair 共享 topic/entity ≥ min_count 才自動建 tunnel，`topic:`/`entity:` 前綴隔開合成 room（palace_graph.py:741-951）。
- **(b)**：改成 wiki 編譯的一個步驟：掃各 note tags/entities，共享 tag 出現在 ≥2 wing 且 ≥N 篇時，產生/更新 `shared-topics.md` MOC（`## angular` 下列出各 wing 的 wikilink）。前綴 → namespaced tag（`#topic/angular`），與實體資料夾區隔。
- **(c) 判定：改造採用**。**必須保留 min_count 門檻且 >1**——caveat 明說 min_count=1 會為 Python/Git/Docker 這種通用詞製造 link spam。與第 9 項的關係：9 是被動發現、11 是把發現物化成一頁 MOC；兩者不衝突，11 的產出正好是 9 的導覽入口。

---

## 四、分層載入（session 注入策略）

### 12. L0 Identity
- **(a)**：純文字 `identity.txt`，唯一非 ChromaDB 層，wake-up 第一個組入（layers.py:39-73）。
- **(b)**：`identity.md`，session 開始整段注入。零改造成本。
- **(c) 判定：採用**。

### 13. L1 Essential Story
- **(a)**：掃全庫按 importance/weight metadata 排序取 top-15、按 room 分組、硬限 3200 字（layers.py:81-184）；另有純檔案生成器 generate_layer1（dialect.py:806-924）。
- **(b)**：走靜態檔路線：`essential-story.md`，由 wiki 蒸餾步驟週期重生。**關鍵修正**：caveat 指出 L1 依賴每則 note 手動維護數值 weight，否則排序退化為預設值——你的系統有 LLM 蒸餾層，**讓 LLM 直接編輯策展 essential-story.md**（判斷什麼重要），完全繞過數值權重的維護負擔。上限規範（≤15 條、≤3200 字）照抄。
- **(c) 判定：改造採用**。這是「編譯式 wiki」勝過原系統的地方：原系統用數值排序模擬編輯判斷，你有真的編輯（LLM）。

### 14. L2 On-Demand（metadata filter 檢索）
- **(a)**：非語意、純 where-filter 的 col.get()（layers.py:192-244），對話提到某 wing/room 才觸發。
- **(b)**：= 按資料夾/tag 載入一批 note。`obsidian-cli` 或 glob/grep by frontmatter 即可。對話提到某專案時，agent 讀該 wing 的 `index.md` 再開命中檔。
- **(c) 判定：採用**。注意它本來就不是語意搜尋，所以移植零損失——這層是純 markdown 版的主力檢索路徑。

### 15. L3 Deep Search（語意搜尋）
- **(a)**：col.query embedding 搜尋，unlimited、按需（layers.py:252-360）。
- **(b)**：無法純 markdown 重現。降級：ripgrep/Obsidian 全文檢索。設計上 L3 本來就按需、不注入 session，所以可以先不做，讓 agent 需要時用搜尋工具。
- **(c) 判定：捨棄語意、保留「按需深搜」的介面位置**。與前提（無向量檢索）一致。若未來要補，可掛一個獨立輕量 embedding index 只服務這層，不污染 L0-L2 的純檔案性。

### 16. wake_up() 組裝 + 注入機制
- **(a)**：wake_up 只組 L0+L1（~600-900 tokens，layers.py:388-407）；**原系統沒有 SessionStart hook**，注入靠 MCP protocol 指示 AI 主動呼叫 status——這是它的弱點。
- **(b)**：SessionStart hook（或 CLAUDE.md @import）prepend `identity.md + essential-story.md` 串接。wing 參數 → 依 cwd 挑專案專屬 essential-story。
- **(c) 判定：採用並超越原版**。用 hook 自動注入比「靠 AI 記得主動呼叫」可靠且零 token bookkeeping。600-900 token 總預算照抄為驗收標準。

---

## 五、Hooks 與逐字歸檔（Raw 層的生產線）

### 17. Stop hook 骨架（節流 + 背景化）
- **(a)**：shell wrapper 解析 stdin → stop_hook_active 防迴圈 → count-human-messages → `${SESSION_ID}_last_save` state 檔比對 SAVE_INTERVAL=15 → 背景 mine（mempal_save_hook.sh; hook_shell.py）。
- **(b)**：骨架照抄，把 mine 換成「transcript 逐字 render 成 markdown 寫進 Raw 層」。silent 模式回 `{}`，不 block AI，零 token。
- **(c) 判定：採用**。防迴圈、節流、背景化三件事都是實戰調校過的，別重新發明。

### 18. PreCompact hook（同步、無條件）
- **(a)**：唯一同步前景路徑——壓縮前逐字內容即將從 context 消失，正確性優先於 500ms 預算（mempal_precompact_hook.sh:184-190）。
- **(b)**：同步 render 整份 transcript 落地後才回 `{}`。
- **(c) 判定：採用（最高優先）**。對「逐字 Raw 層」而言這是最重要的觸發點。caveat：render 需在 harness timeout 內完成——純文字 render 沒有 embedding，應遠低於 30s，但要對超大 JSONL 做防護。

### 19. SessionEnd hook（抓 stdin → disown → 立即返回）
- **(a)**：1.5s 硬 timeout 下的解法：`payload=$(cat)` 後整包丟背景子程序 disown，主程序立刻 `printf '{}'`（mempal_session_end_hook.sh:34-41）；補「短 session 什麼都沒存」的洞。
- **(b)**：照抄模式，背景做最後一次 render + 清 last_save marker。
- **(c) 判定：採用**。短對話是最容易漏存的場景。Windows 支援是 best-effort（原系統亦然），macOS 環境無虞。

### 20. JSONL 解析引擎（render_jsonl + normalize 的工具格式化）
- **(a)**：`render_jsonl.py` 是 stdlib-only 精簡 renderer；normalize.py 補 tool_use/tool_result 人類可讀格式化、tool-result-only user 訊息摺疊回 assistant turn（normalize.py:191-250, 685-828）。
- **(b)**：以 render_jsonl.py 為底，選擇性搬 normalize 的工具格式化，輸出 `**User:**`/`**Assistant:**` markdown。
- **(c) 判定：採用，但有一個必須決策的衝突**：normalize 的 tool_result 刻意有損裁切（head+tail 20 行、2KB cap）——**與「100% 逐字」目標直接矛盾**。建議：user/assistant 文字 100% 逐字；tool_result 保留裁切（工具輸出是可重現的環境產物，非記憶本體），並在 Raw 層檔頭聲明此政策。若日後要真逐字，拿掉 `_TOOL_RESULT_MAX_*` 常數即可。

### 21. strip_noise（系統雜訊剝除）
- **(a)**：整組 line-anchored regex 剝 `<system-reminder>`/hook chrome/摺疊標記，只在 Claude Code 解析路徑套用（normalize.py:43-113）。
- **(b)**：整組照抄，否則 Raw 層會被 system-reminder 淹沒。
- **(c) 判定：採用，同樣標注為「逐字政策的例外」**（與第 20 項是同一個政策決定的兩面）：剝系統注入、留使用者原文。建議保留 `<command-name>`（記錄使用者跑了哪個 slash command，有記憶價值）。維護成本：Claude Code 改注入格式時 regex 要跟上。

### 22. Exchange-pair 切塊（800 字 drawer）
- **(a)**：`>` 標記切 Q+A、CHUNK_SIZE=800、min 30 丟雜訊（convo_miner.py:139-251）。
- **(c) 判定：捨棄**。研究 caveat 說得對：800 字切塊是為 embedding 檢索服務的，逐字歸檔要整份一檔，切塊反而破壞閱讀。可零碎借用：min_chunk_size 丟雜訊門檻、room 關鍵字打分當 frontmatter tag 來源（併入第 3 項的路由表）。

### 23. 效能預算模式（hooks under 500ms）
- **(a)**：重活背景化、禁止 hook 冷啟 daemon、shell 只做輕解析、kill-switch 早退、PID slot 去重（hooks_cli.py 多處）。
- **(b)**：三條照抄：Stop/SessionEnd 背景 spawn + 立即回 `{}`；hook 前景絕不做重 I/O；wrapper 只解析+計數+節流。
- **(c) 判定：採用**。純 markdown render 遠輕於 embedding 管線，預算更寬鬆，但模式本身是好習慣。

### 24. 計數節流（last_save marker）
- **(a)**：count-human-messages + per-session state 檔（hook_shell.py:68-94）。
- **(c) 判定：簡化採用**。依 caveat：逐字歸檔最佳策略是「deterministic 檔名 = session_id、每次覆寫整份」，此時計數只用來決定要不要重 render（省 I/O），不需要 block 機制。核心寫入點是第 18/19 項（PreCompact/SessionEnd 各一次必寫），Stop 的節流 render 是錦上添花。

### 25. Wing 推導（JSONL cwd）+ 路徑安全
- **(a)**：掃前 200 行取第一個 `cwd` 的 leaf 當專案 slug（hooks_cli.py:954-991）；transcript 路徑/session_id 白名單驗證防 traversal。
- **(b)**：直接搬——這決定 Raw 層檔案落在哪個 wing 資料夾；session_id 當檔名，sanitize 必要。
- **(c) 判定：採用**。`wing_` 前綴可去掉、改用原始資料夾名（自訂點，caveat 已標）。

### 26. Hook 內直接落地範本（_save_diary_direct）
- **(a)**：silent 模式在 hook 程序內直接寫入、`_output` 繞過 stdout 重導、systemMessage 一行回報（hooks_cli.py:754-849, 216-245）。
- **(b)**：把「組 CHECKPOINT 寫 palace」換成「render → 寫 .md」；_extract_themes 產 frontmatter tag。
- **(c) 判定：採用骨架、換掉兩處**：(1) _extract_recent_messages 只取 user 且截 200 字——逐字歸檔要完整雙方對話；(2) 停用詞英文-only，中文 vault 需換詞表或乾脆讓蒸餾時的 LLM 打 tag（與第 5 項的「LLM 取代 regex」一致）。

---

## 六、知識圖譜 / 實體層（Wiki 層的骨架）

### 27. Temporal KG：entity + (s,p,o) + [valid_from, valid_to]
- **(a)**：兩張 SQLite 表；事實帶半開時間區間 + confidence + 溯源欄；日期強制 canonical ISO 讓字串比較=時間比較；as_of 查詢 = 區間過濾（knowledge_graph.py:142-176, 106-126）。
- **(b)**：每 entity 一個 wiki note：frontmatter 放節點屬性（type/aliases/birthday），正文一張事實表 `| predicate | object(wikilink) | valid_from | valid_to | confidence | source |`。object 用 wikilink → incoming 查詢由 backlinks 免費取得。as_of/timeline 用 Bases/Dataview view。
- **(c) 判定：採用（Wiki 層的核心 schema）**。caveat 要正面處理：**日期格式紀律必須由 ingest skill 強制**（只准 `YYYY-MM-DD` 或 `…Z`），否則字串比較的時間語意靜默崩壞；markdown 無外鍵，拼寫漂移防線 = 第 2 項 slug + `aliases:`。

### 28. Invalidate 而非刪除（`valid_to` 空白 = 現行事實）
- **(a)**：UPDATE 填 valid_to、絕不 DELETE；`valid_to IS NULL` 同時是現行性標記與去重鍵；倒置區間拒收（knowledge_graph.py:330-360, 298-303）。
- **(b)**：編輯規則三條照搬：作廢=填 valid_to 不刪列；更正=舊列填 valid_to + 新增一列留空；append 前掃表去重（同 predicate+object 且 valid_to 空白則跳過）。倒置區間檢查做成 lint。
- **(c) 判定：採用**。這是 wiki 層「記憶不遺忘、只修正」的正確語意。caveat：無交易鎖——你的寫入路徑全走單一 ingest skill 序列化即可；append-only 增長靠 view 折疊（Current facts / As-of / Timeline 三個 Base view）維持可讀。

### 29. Entity 消歧（registry + 上下文打分）
- **(a)**：三層來源優先序（onboarding > learned > researched）、COMMON_ENGLISH_WORDS 撞名旗標、PERSON vs CONCEPT context patterns 打分、aliases canonical 互指（entity_registry.py）。
- **(b)**：registry → `entities/` 每 entity 一 note，frontmatter `type/source/confidence/aliases`；ambiguous 加 `ambiguous: true`；aliases 用 Obsidian 原生欄位（Maxwell↔Max 免費解析）；unconfirmed → `#needs-review` tag。
- **(c) 判定：部分採用**。採用：registry 結構、來源優先序、aliases、needs-review 流程。**捨棄：英文 regex 打分表與 Wikipedia lookup**——前者純英文樣式（中文語境無效），且你的 ingest 走 LLM，消歧交給 LLM + registry 對照即可；後者違反 local-first，原系統也預設關閉。

---

## 七、衝突與重複總整理（跨發現交叉檢核）

| # | 衝突/重複 | 裁決 |
|---|---|---|
| 1 | **AAAK dialect（第 6 項）vs Closet pointer（第 5 項）**：同一索引層的兩種格式，研究分別推薦了兩者 | 只移植 closet 四段式；AAAK 僅留「規範即 prompt」手法。兩套都做是重複建設 |
| 2 | **Room topic 軸 vs time 軸**（第 3 項） | Raw 層=時間、Wiki 層=主題，雙層各佔一軸 |
| 3 | **逐字原則 vs strip_noise/tool_result 裁切**（第 20/21 項）：一邊要 100% verbatim，一邊建議有損剝除 | 定義「逐字」範圍=使用者與助理文字；系統注入與工具輸出屬環境噪音，剝除/裁切並在檔頭聲明政策 |
| 4 | **逐字原則 vs 800 字切塊**（第 22 項） | 切塊為檢索服務，無檢索需求即捨棄；整份一檔 |
| 5 | **L1 數值權重排序 vs 無人維護 frontmatter 權重**（第 13 項） | 捨棄數值排序，由 wiki 蒸餾的 LLM 直接策展 essential-story.md |
| 6 | **三種 tunnel 機制重疊**（第 9/10/11 項）：passive/explicit/auto 在 markdown 中大量塌縮 | 全部塌縮為：命名紀律（passive）+ 行內 wikilink（explicit）+ 門檻式 MOC 產生（auto）。sidecar JSON、canonical ID、dynamics 全捨 |
| 7 | **「掃索引即可召回」vs 實測 84.2% R@5**（第 8 項）；且你連 96.6% 的語意 fallback 都沒有 | 索引定位為近似定位器，規範中明寫 grep fallback；不重複任何壓縮率/召回宣稱 |
| 8 | **MCP 靠 AI 主動 wake-up vs hook 注入**（第 16 項）：原系統無 SessionStart hook | 用 SessionStart hook 注入，比原系統更可靠 |
| 9 | **計數節流 vs 覆寫式歸檔**（第 24 項） | 覆寫式為主，節流僅省 render；必寫點在 PreCompact/SessionEnd |
| 10 | **英文-only 啟發式**（themes 停用詞、消歧 patterns、hall/room 關鍵字表）散見多項 | 統一裁決：所有語言相關啟發式改由 ingest LLM 承擔，詞表只留作 fallback |

---

## 八、最終清單（一句話版）

**照抄**：wing slug 正規化(2)、daily 檔名慣例(3)、closet 四段索引行+上限數字(5,7)、L0 identity(12)、L2 filter 載入(14)、三個 hook 骨架(17,18,19)、strip_noise(21)、效能模式(23)、cwd 推 wing+路徑安全(25)、temporal 事實表+invalidate 規則(27,28)。

**改造後採用**：扁平標籤模型→frontmatter+視圖(1)、room 路由表→蒸餾規則(3)、索引行生成 regex→LLM(5)、L1→LLM 策展靜態檔(13)、wake_up→SessionStart hook(16)、auto tunnels→門檻式 MOC(11)、diary direct-write→render 全對話(26)、entity registry→entities/ notes(29)。

**捨棄**：Hall(4)、AAAK 編碼格式(6)、壓縮率宣稱(8)、tunnel sidecar/canonical-ID/dynamics(10)、L3 語意搜尋(15)、800 字切塊(22)、Wikipedia lookup 與英文消歧 regex(29)。

---

## 附錄：原始研究發現（rawFindings）

### 1. Storage model — Wings/Rooms/Drawers are flat metadata tags, NOT a directory tree

**運作方式**：There is no per-wing or per-room folder anywhere. A 'palace' is a single vector-DB collection (default `mempalace_drawers`, backed by `chroma.sqlite3`) living in `palace_path` (default `~/.mempalace/palace`, config.py:197). Every drawer is ONE ChromaDB document = one verbatim text chunk. Its structure is entirely in a flat `metadatas` dict: `wing`, `room`, `hall`, `source_file`, `chunk_index`, `added_by`, `filed_at`, `source_mtime`, `normalize_version`, `id_recipe`, optional `line_start`/`line_end`, `content_date`, `entities`, `date` (miner.py:1259-1281). The drawer's primary key encodes the hierarchy as a string, not a path: `drawer_{wing}_{room}_{hash24}` where hash24 = first 24 hex of SHA-256 over the '|'-delimited `source_file|chunk_index` (ids.py:56-68, make_drawer_id_from_chunk). The Wing→Room→Drawer 'hierarchy' is emergent: it exists only by GROUPING documents on the `wing`/`room` tag columns (e.g. palace_graph.build_graph iterates all docs and buckets by `meta['room']`, palace_graph.py:119-148). A second collection `mempalace_closets` (palace.py:262-273) holds the compact index layer.

**移植/意義**：This is the crucial reframing for a markdown port: the source system is NOT a folder tree, so you are free to CHOOSE the mapping rather than mirror one. The natural direct mapping is Wing→top-level folder, Room→subfolder, Drawer→a `.md` file (or a `##` section). Because wing/room are just tag strings, you can equivalently store them as frontmatter (`wing:`, `room:`, `hall:`) on flat notes and let the folder tree be optional/derived. Verbatim-always principle (CLAUDE.md) → store exact text, never summarize.

**採用**：是　**注意**：The whole retrieval mechanism is semantic vector search over these chunks; a pure-markdown vault loses that and must fall back to full-text/grep + the generated index. The system's '100% recall' search paths do not survive the port unmodified.

### 2. Wing — person/project top-level category with slug normalization

**運作方式**：A wing is a single string metadata value (miner.py:1260). It comes from the project's `mempalace.yaml` `wing:` field, or falls back to the normalized project dirname when no yaml exists (miner.py:415-424, load_config). All wing names pass through `normalize_wing_name()` (config.py:34-46): lowercase, replace spaces and '-' with '_', strip leading/trailing '_'. This same rule is applied at write time and at every graph/tunnel lookup so `my-project`, `my project`, `my_project` all collapse to one wing. Name safety is enforced by `sanitize_name()` (config.py:49-74): max 128 chars, blocks `..`, `/`, `\`, null bytes, and a safe-char regex.

**移植/意義**：Wing → one top-level directory whose name is the `normalize_wing_name` slug (`code/`, `my_project/`, `family/`). Reuse the exact normalization + sanitization rules to derive folder names, so link targets stay stable. Alternatively keep a `wing:` frontmatter key if you prefer a flat vault. This is the single cleanest 1:1 mapping in the whole system.

**採用**：是

### 3. Room — topic-routed (or day-routed) grouping inside a wing

**運作方式**：A room is another flat string tag. Two routing strategies exist. TOPIC routing (project miner, detect_room miner.py:464-503): priority order = (1) a folder-path segment matches a configured room name/keyword, (2) filename matches, (3) content keyword scoring against per-room keyword lists from `mempalace.yaml` (`rooms: [{name, description, keywords}]`), (4) fallback `general`. Convo miner uses detect_convo_room (convo_miner.py:325-335): score content against TOPIC_KEYWORDS, else `general`; in `general` extract mode room is per-chunk = the chunk's `memory_type` (convo_miner.py:424). TIME routing (diary_ingest.py:141-192): the day file is named `YYYY-MM-DD.md`, the date is parsed from the filename (line 146-149), and the drawer gets `room='daily'` plus a `date` metadata field (line 186-188).

**移植/意義**：Two complementary ports. Topic rooms → subfolders per topic (`code/chromadb_setup/…`) or a `room:` frontmatter tag driven by a keyword-routing rule you keep in a config file (port the keyword-scoring table verbatim). Time rooms → daily notes `YYYY-MM-DD.md` in a `daily/` folder — this is already literally a markdown-file convention in diary_ingest, so it ports 1:1. Keyword-based auto-routing is the reusable idea: a small YAML of `{room: [keywords]}` + 'first folder/filename/content match wins' gives deterministic filing.

**採用**：是　**注意**：'Room' conflates two orthogonal axes (topic vs. day). Only the diary layer sets `room='daily'`+`date`; project/convo drawers set `content_date`/`filed_at` but NOT `date`, so time-grouping is reliable only for daily notes. Decide up front whether a folder level means topic or date — don't try to make one folder axis mean both.

### 4. Hall — content-TYPE classifier orthogonal to Room

**運作方式**：Hall categorizes the TYPE of content (emotional/technical/family/…) while room categorizes the TOPIC (miner.py:860-882, detect_hall). It is keyword scoring against `MempalaceConfig.hall_keywords` — a fixed dict of hall→keyword-list (config.py:248-304, DEFAULT_HALL_KEYWORDS with buckets emotions/consciousness/memory/technical/identity/family/creative). Highest-scoring hall wins, else `general`. Stored as the flat `hall` metadata field; the graph collects halls per room as the 'corridor' edge type (palace_graph.py:135-145, 156-166).

**移植/意義**：Hall → a frontmatter property (`hall: technical`) or a nested tag (`#hall/technical`). It is a pure classifier, so it maps directly to a tag. Keep the keyword→hall table as config and run the same 'sum keyword hits, argmax' scorer at file-ingest time to auto-tag.

**採用**：是　**注意**：Halls barely add value beyond a tag; in Obsidian a tag + graph filter subsumes them. Consider dropping the separate concept and just using topical tags unless you want the fixed emotional/technical taxonomy.

### 5. Closet / AAAK index — a compact, greedily-packed pointer layer for scan-without-reading

**運作方式**：Closets are the searchable index layer (palace.py:262-273), a separate `mempalace_closets` collection. build_closet_lines (palace.py:539-624) turns a drawer's content into atomic one-line topic pointers: `topic|entities|YYYY-MM-DD:Lstart-Lend|→drawer_ids` (4-seg Tier-6a form) or legacy `topic|entities|→drawer_ids` (3-seg). Topics = extracted action-verb phrases + markdown `#`/`##`/`###` headers + quotes; entities = proper nouns appearing ≥2× minus a stoplist/COCA filter (palace.py:566-604). The date+line locator (`_build_date_line_segment`, palace.py:627-665) prefers `content_date` then truncated `filed_at`, plus `line_start`/`line_end`, so a reader can jump to the exact span. upsert_closet_lines (palace.py:681-718) packs lines greedily up to CLOSET_CHAR_LIMIT=1500 chars/closet, never splitting a line, numbering closets deterministically `{base}_01`, `_02`. The point: an LLM scans thousands of these compact pointers instantly and only opens the drawers it needs.

**移植/意義**：This is the single most valuable idea to steal for a wiki. Closet → an auto-generated index/MOC note per wing (or per room): a bulleted list where each line is `- topic — entities [[note#Lstart-Lend]]`. Instead of `→drawer_ids` hashes, use wikilinks (`[[note]]` or block refs). Regenerate on ingest. This gives the 'read the index, then open only the right file' workflow that a flat vault otherwise lacks, and it is plain markdown (or an Obsidian Base/dataview view). The line-range locator (`file#Lstart-Lend`) ports to Obsidian block/heading links.

**採用**：是　**注意**：Topic/entity extraction here is regex + frequency heuristics (verbs, headers, quotes, ≥2× proper nouns), not semantic — it produces noisy pointers. For a wiki you'd likely let an LLM generate the index lines instead of the regex extractor to get cleaner topics.

### 6. Passive tunnels — cross-wing links DERIVED from shared room names (no storage)

**運作方式**：The core cross-wing mechanism (palace_graph.py:90-292). build_graph scans every drawer's metadata and builds `room_data[room] = {wings:set, halls:set, count, dates:set}` (line 119-148). A tunnel = any room name that appears in ≥2 different wings: edges are emitted for every wing-pair × hall of such rooms (line 150-166); find_tunnels returns rooms with `len(wings)>=2` optionally filtered by wing (line 251-292); traverse does BFS from a start room to other rooms sharing a wing, up to max_hops (line 189-248). Nothing is persisted — the graph is recomputed from ChromaDB metadata and cached in-process with a 60s TTL + write-invalidation (line 60-76, 105-186). So 'a topic that bridges two projects' is just the SAME room string occurring under two wing strings.

**移植/意義**：In Obsidian this is FREE and needs no equivalent code: a room note or a shared tag referenced from two wings is exactly a passive tunnel, and the graph view + backlinks surface it. Port by using consistent room-note titles / aliases (or a `#topic/angular` tag) across wings; the local graph and backlinks reproduce build_graph + traverse. The reusable insight: identity-by-name across categories, resolved at read time, beats maintaining an explicit edge list.

**採用**：是　**注意**：Passive tunnels hinge on EXACT string equality of room names across wings — a fragile join. You must enforce consistent naming (the normalize_wing_name-style slugging, or Obsidian aliases) or the 'bridges' silently fail to appear, exactly the hyphen/underscore bug the code repeatedly guards against.

### 7. Explicit tunnels — persisted, symmetric, labeled cross-wing edges in a sibling JSON file

**運作方式**：Agent-created links that passive discovery can't infer (palace_graph.py:332-604). Stored NOT in the vector DB but as a plain JSON list `tunnels.json`, a SIBLING of palace_path (config.py:346-348: `dirname(palace_path)/tunnels.json`) so they survive palace rebuilds. Each record: `{id, source:{wing,room,drawer_id?}, target:{wing,room,drawer_id?}, label, kind, created_at, updated_at?}` plus L7 dynamics fields. Tunnels are UNDIRECTED: `_canonical_tunnel_id` (line 441-454) sorts the two `wing/room` endpoint keys, joins with '↔', sha256[:16] — so create_tunnel(A,B) and create_tunnel(B,A) yield the same ID and dedup into one record; a re-create updates the label and preserves created_at + dynamics (line 579-604). `kind` ∈ {explicit, topic, entity}. Writes are atomic (tmp file + os.replace, chmod 0700/0600, line 397-434) and serialized under `mine_lock(tunnel_file)`. Read paths list_tunnels/follow_tunnels (line 607-702) normalize wing names on BOTH sides so hyphen/underscore variants match either way.

**移植/意義**：In a markdown vault, an explicit tunnel is just a wikilink — and because Obsidian backlinks are inherently bidirectional, the symmetric-ID/dedup machinery becomes unnecessary: `[[target-note]]` in a note already creates the undirected edge. Two viable ports: (a) pure wikilinks with an inline label (`[[auth]] — shares session model`), letting backlinks be the tunnel store; or (b) if you need the label/kind/dynamics, keep a small `tunnels.md` table or a `related:` frontmatter list. The atomic-write + sidecar-outside-the-data pattern is worth keeping only if you retain a JSON sidecar; with wikilinks you drop it entirely.

**採用**：是　**注意**：The dynamics fields (strength/stability/last_activated/access_count, initialize_dynamics_fields at palace_graph.py:595) have no natural markdown home and would need a script to maintain frontmatter counters — likely not worth porting for a wiki.

### 8. Auto-generated topic & entity tunnels — pairwise wing linking above a threshold

**運作方式**：Two generators reuse create_tunnel so they share storage/dedup with explicit tunnels. compute_topic_tunnels (palace_graph.py:741-822): given `topics_by_wing = {wing: [topic,...]}`, for every wing-pair sharing ≥ min_count topics (config `topic_tunnel_min_count`, default 1, config.py:732-756), drop a symmetric tunnel per shared topic with a SYNTHETIC room `topic:<name>` (TOPIC_ROOM_PREFIX, line 723-738) and kind='topic'. The `topic:`/`entity:` prefix namespaces these away from literal folder-derived rooms so they can't collide. entity_tunnels_for_wing (line 879-951): bridges wings that share an entity appearing in both wings' hallway records, synthetic room `entity:<name>`, kind='entity'. topic_tunnels_for_wing (line 825-876) does the incremental single-wing update after one wing finishes mining.

**移植/意義**：Port as a periodic index-generation step: scan each note's tags/entities, and for any tag shared by notes in ≥2 wings above a threshold, emit a link or an entry in a generated `shared-topics.md` MOC (`## angular\n- [[code/…]]\n- [[myproject/…]]`). The synthetic `topic:`/`entity:` room prefix maps to a namespaced tag (`#topic/angular` vs a literal folder `angular/`) so auto-links and real notes stay distinguishable. The min_count threshold (require ≥N shared tags before linking) is a good noise filter to keep.

**採用**：是　**注意**：With min_count=1 this creates a tunnel for every single shared common-tech tag (Python, Git, Docker), producing link spam — the config exists precisely to raise the bar. Set a threshold, or restrict to curated topic/entity vocabularies, before auto-linking in a wiki.

### 9. AAAK 索引行格式（dialect.py 的核心壓縮格式）

**運作方式**：AAAK 是一種「有損的結構化摘要」格式，任何 LLM 直接讀文字即可、不需 decoder（dialect.py:8-15 docstring 明確標註 NOT lossless）。docstring FORMAT 區塊（dialect.py:20-24）定義四種行型別，全部用 `|` 分隔欄位：
- Header: `FILE_NUM|PRIMARY_ENTITY|DATE|TITLE`
- Zettel: `ZID:ENTITIES|topic_keywords|"key_quote"|WEIGHT|EMOTIONS|FLAGS`
- Tunnel: `T:ZID<->ZID|label`
- Arc: `ARC:emotion->emotion->emotion`

實際組裝在 encode_zettel()（dialect.py:703-732）：zid 取 id 最後一段、實體用 `+` 連（711）、topic 用 `_` 連取前 2（714）、quote 加雙引號（717）、接 weight、emotions（`+` 連取前 3，encode_emotions 403-410）、flags。plain-text 版 compress()（dialect.py:561-624）產出兩行：metadata header `wing|room|date|stem`（604-611）＋ content line `0:ENT+ENT|topic1_topic2_topic3|"≤55字關鍵句"|emotion+emotion|FLAG+FLAG`（614-622）。

tests/test_dialect.py:165-166 有可驗證的實際範例：
```
001|ALC+BOB|2025-01-01|test_title
ARC:journey
001:ALC|memory_ai|"test quote"|0.9|joy
```
實體碼：已知名字查 entity_codes、未知則取前 3 字大寫（encode_entity 389-401）；情緒碼表 EMOTION_CODES（53-94，如 vulnerability→vul）＋純文字關鍵字偵測 _EMOTION_SIGNALS（97-120）；flags 由 _FLAG_SIGNALS 關鍵字觸發 ORIGIN/CORE/SENSITIVE/PIVOT/GENESIS/DECISION/TECHNICAL（34-41, 123-158）。

**移植/意義**：直接把 4 種行型別當成 markdown index 檔的行規範即可（本來就是純文字、無 Python 依賴）。定義一份『索引檔格式規範』：每筆記憶一行，`ENTITY_CODE|topic_a_topic_b|"關鍵句"|weight|emo1+emo2|FLAG`，檔頭一行 `FILE|ENTITIES|DATE|TITLE`。附上 EMOTION_CODES 表與 FLAGS 表當成規範附錄，讓 LLM 讀規範就能寫/讀。欄位分隔沿用 `|`、實體/情緒/flag 內部用 `+`、topic 內部用 `_`（避免與 `|` 衝突）。

**採用**：是　**注意**：格式是有損摘要，原文無法重建；情緒/flag 靠關鍵字硬比對，跨語言與反諷會誤判。若放進 markdown 表格，`|` 會與表格語法衝突，需改用非表格的純行格式或改分隔符。

### 10. Closet pointer 索引格式（palace.py build_closet_lines —— 真正指向 drawer 的生產級索引）

**運作方式**：這才是 CLAUDE.md 所說『指向 DRAWER 位置的壓縮指標、讓 LLM 掃描而不必讀全文』的實際實作。get_closets_collection 註解直接寫『the searchable index layer』（palace.py:267）。build_closet_lines()（palace.py:539-624）為每個來源檔產生多條原子指標行，兩種格式（palace.py:545-546, 608-611）：
- 舊版 3 段：`topic|entities|→drawer_ids`
- Tier 6a 4 段：`topic|entities|YYYY-MM-DD:Lstart-Lend|→drawer_ids`

關鍵細節：drawer_ref = 前 3 個 drawer id 以 `,` 連（557）；entities = 出現≥2 次的專有名詞、以 `;` 連、最多 5 個（584-588）；topics 由動作動詞 regex（built|fixed|wrote…）＋markdown 標題抽出、最多 12（591-600）；quotes 15-150 字取前 3（603, 616-617）；日期段由 _build_date_line_segment 產 `content_date:Lstart-Lend`（627-665）。範例（依格式推得）：`fixed auth timeout|Alice;GraphQL|2026-05-21:L10-L42|→drawer_001,drawer_002`。這些行被 upsert_closet_lines() 貪婪打包進每個 ≤1500 字的 closet（CLOSET_CHAR_LIMIT，palace.py:447, 681-699），存進 `mempalace_closets` collection（palace.py:270）。cli.py 的 `mempalace compress`（cli.py:1326-1443）也會把 dialect.compress() 的 AAAK 輸出 upsert 進同一個 closets collection（1428-1437），所以兩種格式共用同一索引層。

**移植/意義**：這個 4 段式最適合當 markdown index 檔的『一行一指標』規範：`主題短語 | 實體;分號分隔 | YYYY-MM-DD:L起-L迄 | →目標`。目標欄改成 markdown 連結即可指向 verbatim 內容：純檔案用 `→path/to/note.md#L10-L42`，Obsidian 用 wikilink `→[[note#^blockid]]`。一個 index.md 收數千行，每行指向真正存全文的檔案/區塊。抽取規則（動作動詞開頭的主題、≥2 次的專有名詞當實體、日期+行號定位、最多 3 個目標）可原封不動寫成規範文字，交給 LLM 產生索引行。

**採用**：是　**注意**：指標是『近似定位器非完整索引』（palace.py:635-636 明說只讀第一個 meta、只取前 3 個 drawer），會漏指；行號 L 段依賴 mining 時記錄的 line_start/line_end，純 markdown 移植需自行維護行號或改用 block anchor。

### 11. 如何讓 LLM 掃數千條目而不爆 token（兩層 index/verbatim + 掃描上限）

**運作方式**：核心是『index 與 verbatim 分離』：closets collection 存極短指標行，drawers collection 存全文；LLM 只掃 index、靠 `→drawer_ids` 決定要打開哪個抽屜，再只取回那幾個 drawer 全文（CLAUDE.md『Index layer (AAAK): Compressed pointers → DRAWER locations, Scanned by LLM to find relevant drawers without reading all content』）。三重上限確保不爆 token：
1. 每個 closet ≤1500 字貪婪打包、行不跨 closet（palace.py:447, 681-699）——數千 drawer 壓成少量 closet 行。
2. Layer1 喚醒檔（layers.py:81-90）硬限 MAX_DRAWERS=15、MAX_CHARS=3200（≈800 tokens）、MAX_SCAN=2000（最多掃 2000 筆就停，123 行）。
3. 格式本身可被任何 LLM 原生閱讀、無需 decoder（dialect.py:8-10），所以掃描本身不需額外的解碼 prompt/計算。
dialect.py 另有 generate_layer1()（806-924）把最高權重（≥0.85）與 ORIGIN/CORE/GENESIS flag 的條目挑出、按日期分組成 MOMENTS 區塊，形成一份極短的『必讀』索引。

**移植/意義**：移植成兩份 markdown：(a) `index.md`（或多份分片）—— 每行一條 closet pointer，指向 verbatim 檔案；(b) verbatim 筆記本體。再加一份 `L1.md` 喚醒檔，套用同樣的硬上限規範（例如：最多 15 條、總長 ≤3200 字、只收重要性最高者），讓 agent 每次只讀 L1＋index，命中後才用連結打開全文。上限數字（1500 字/closet、15 條、3200 字）直接寫進規範。

**採用**：是　**注意**：『掃描 index 就能找到正確 drawer』的召回品質有限：benchmark 顯示 AAAK 索引模式 R@5 只有 84.2%，比直接語意搜尋原文的 96.6% 低 12.4 個百分點（docs/HISTORY.md:94-99），純靠壓縮索引掃描會漏召回。

### 12. 壓縮率的真實數字（compression_stats + 官方勘誤）

**運作方式**：程式碼不寫死任何壓縮率，而是每次即時算：compression_stats()（dialect.py:967-983）回傳 `size_ratio = 原始tokens / 摘要tokens`，token 用 count_tokens() 以『每字約 1.3 tokens』估（dialect.py:954-965，並註明舊的 len(text)//3 啟發式『wildly inaccurate、把壓縮率灌水』）。cli.py compress 摘要用 ~3.8 chars/token 估（cli.py:1447-1450）。真實數字見官方勘誤 docs/HISTORY.md:87-99：『30x lossless compression 被誇大』——AAAK 是有損縮寫（實體碼＋截句）；小規模下甚至不省 token（英文範例 66 tokens → AAAK 73 tokens，反而變大）；只在『大量重複實體』時才有壓縮效益。以整個 drawer（≈1500 字）壓成單行 AAAK（≈80-150 字）粗估約 10-20x（以字元計），但屬有損摘要而非壓縮。

**移植/意義**：移植規範時不要承諾固定壓縮率；改成『索引行目標長度』的可驗證約束（例如：每條指標行 ≤120 字元、每個 index 分片 ≤1500 字元）。若要報數字，就照 compression_stats 的做法：原文 token 數 ÷ 索引 token 數，並標註『有損、僅供估算』。

**採用**：否　**注意**：『30x/無損』是已被作者自己撤回的過度宣稱；任何移植文件都應避免重複，並明確標示有損與召回代價（84.2% vs 96.6%）。

### 13. AAAK_SPEC / i18n 指令（給 LLM 的『索引方言』說明，可直接當 markdown 規範）

**運作方式**：除了 dialect.py 的機械式編碼，專案還維護一份給 LLM 閱讀的自然語言方言規範 AAAK_SPEC（mcp_server.py:1536-1553），透過 tool_status 的 `aaak_dialect` 欄位隨每次狀態查詢注入給 LLM（mcp_server.py:1271, 1487, 1505）。它定義：ENTITIES=3 字大寫碼（ALC=Alice）、EMOTIONS=`*marker*`（*warm*=joy）、STRUCTURE=pipe 分隔、DATES=ISO、COUNTS=`Nx`（570x）、IMPORTANCE=★–★★★★★、HALLS/WINGS/ROOMS 命名。範例：`FAM: ALC→♡JOR | 2D(kids): RIL(18,sports) MAX(11,chess+swimming) | BEN(contributor)`。另有極簡的 i18n 壓縮指令（i18n/en.json:36）：『Compress to index format. Hyphens between words, pipes between concepts. Drop articles and filler. Keep names and numbers exact.』——這 4 句就是最精煉的移植規範，且已翻成 20+ 語言（i18n/*.json 皆有 aaak.instruction 鍵）。

**移植/意義**：直接把 AAAK_SPEC 這段文字（FORMAT + EXAMPLE + 『Read AAAK naturally / When WRITING AAAK』）當成 markdown index 檔規範的開頭區塊，貼在 index.md 頂端或另存 `INDEX-FORMAT.md`。i18n/en.json:36 那 4 句可當一句話 TL;DR 規則。這是純文字、零程式，是最省力的移植路徑：規範即 prompt。

**採用**：是　**注意**：AAAK_SPEC 用了 emoji/星號（★、♡、⚠、*marker*），在某些 markdown 渲染或 grep 流程可能不便；實體 3 字碼在大型 vault 易撞碼（ALC 可能同時是 Alice/Alexander），需要一份實體對照表（dialect 用 entities.json 管理，from_config 350-366）搭配。

### 14. L0 — Identity（永遠載入，~100 tokens）

**運作方式**：class Layer0 (layers.py:39-73)。放「我是誰」的靜態身分：讀取純文字檔 ~/.mempalace/identity.txt（layers.py:51-54）。內容是使用者手寫的自由文字，docstring 範例 (layers.py:44-48) 顯示放：assistant 名稱與角色、traits（warm/direct/remembers everything）、people（creator、partner 等關鍵人物）、project 一句話描述。render() (layers.py:57-70) 讀檔 strip 後回傳；檔案不存在時回傳預設提示字串。token_estimate() = len(text)//4 (layers.py:72-73)。這是唯一非 ChromaDB 來源的層，其餘 L1-L3 全部讀 ChromaDB mempalace_drawers collection。時機：wake_up() 一定第一個組進來 (layers.py:399)。預算：docstring 標 ~100 tokens (layers.py:8,41)。

**移植/意義**：直接就是純檔案：把 identity.txt 換成 identity.md（或 CLAUDE.md 的一個區塊）。session 開始時整段注入 system prompt 開頭。移植成本最低——本來就沒依賴 ChromaDB，把 open().read() 換成讀你的 markdown 即可。

**採用**：是

### 15. L1 — Essential Story（永遠載入，~500-800 tokens）

**運作方式**：class Layer1 (layers.py:81-184)。放「palace 中最重要的片刻摘要」。generate() 從 ChromaDB 分批抓 drawer（_BATCH=500，避開 SQLite 999 變數上限，layers.py:106-124），對每則以 importance 評分：依序試 metadata 的 importance / emotional_weight / weight 三個 key（layers.py:136-143，預設 3）。依 importance 降冪排序取前 MAX_DRAWERS=15（layers.py:88,147-148），再依 room 分組（layers.py:151-154），輸出每則 snippet 截斷到 200 字 + 來源檔名（layers.py:169-176）。預算硬上限：MAX_CHARS=3200（~800 tokens，layers.py:89,177），超過就附 '... (more in L3 search)' 提前結束（layers.py:177-179）；MAX_SCAN=2000 限制掃描量（layers.py:90,123）。可傳 wing 過濾成專案專屬 wake-up（layers.py:110-111）。時機：wake_up() 一定第二個組進來（layers.py:403-405）。注意 L1 是 auto-generated，非手寫。

**移植/意義**：兩條路。(A) 動態：保留 generate() 概念，但把資料源從 ChromaDB 換成掃描 markdown notes 的 frontmatter（importance/weight 欄位），取 top-15 組成 wake-up 區塊。(B) 靜態檔案：mempalace 本身已有純檔案版——dialect.py 的 generate_layer1() (dialect.py:806-924) 直接把 zettel JSON 中 emotional_weight>=0.85 或帶 ORIGIN/CORE/GENESIS flag 的片刻，依日期分組寫成一個 '## LAYER 1 -- ESSENTIAL STORY' 檔案（dialect.py:864-922，output_path 直接 f.write）。純 markdown 移植建議走 (B)：維護一個 wake.md（essential-story.md），由背景程序週期性重生，session 開始注入。

**採用**：是　**注意**：L1 靠 metadata 的 importance/weight 數值排序，純 markdown 需要你在 note frontmatter 自己維護權重欄位，否則全部 fallback 到預設值 3、排序失去意義。

### 16. L2 — On-Demand（按需載入，每次 ~200-500 tokens）

**運作方式**：class Layer2 (layers.py:192-244)。放「某個 wing/room 的過濾式檢索結果」——不是語意搜尋，是 metadata filter。retrieve(wing, room, n_results=10) 用 build_where_filter(wing, room) 組 where 條件（layers.py:210，來自 searcher.py），呼叫 col.get() 而非 query()（layers.py:216-217），輸出每則 snippet 截斷 300 字 + room 標籤 + 來源檔（layers.py:230-242）。時機：不在 wake-up，只有當對話中出現特定主題/wing 時才由 MemoryStack.recall() 觸發（layers.py:409-411）。預算 docstring 標每次 200-500 tokens（layers.py:10,196）。

**移植/意義**：對應到「按資料夾/tag 載入一批 note」。純 markdown：wing→資料夾、room→子資料夾或 tag。當對話提到某專案，動態把該資料夾下的 notes（或其摘要）注入。可用 obsidian-cli / grep by tag 取代 col.get()+where filter。

**採用**：是

### 17. L3 — Deep Search（無上限，全語意搜尋）

**運作方式**：class Layer3 (layers.py:252-360)。放「對整座 palace 的語意搜尋結果」。search(query, wing, room, n_results=5) 呼叫 col.query(query_texts=[query])（layers.py:280），把 distance 轉 similarity（_distance_to_similarity，layers.py:296），輸出 [i] wing/room (sim=..) + snippet(截 300) + src（layers.py:292-310）。另有 search_raw() 回傳 dict list 供程式使用（layers.py:312-360），並對 ChromaDB 回傳 None 的 doc/meta 做 graceful degrade（layers.py:343-349）。復用 searcher.py 邏輯。時機：最重、按需，由 MemoryStack.search() 觸發（layers.py:413-415）。預算：unlimited（layers.py:11）。

**移植/意義**：這層是純 markdown 最難完全移植的——需要向量/語意搜尋。折衷方案：(1) 用 ripgrep/全文檢索取代語意搜尋（無語意但零依賴）；(2) 保留一個輕量 embedding index 只給 L3 用，L0-L2 全走純檔案。設計上 L3 本來就是按需、非 session 注入，所以純 markdown 系統可先不做，讓 agent 需要時才用工具搜尋 vault。

**採用**：否　**注意**：L3 依賴 ChromaDB 語意搜尋（col.query + embedding），無法用純 markdown 檔案重現；純檔案版只能降級為關鍵字/全文搜尋，喪失語意召回。

### 18. wake_up() 組裝流程（L0+L1，~600-900 tokens）

**運作方式**：MemoryStack (layers.py:368-445) 是統一入口，__init__ 建 l0/l1/l2/l3 四個 instance，共用 palace_path 與 identity_path（預設 ~/.mempalace/identity.txt，layers.py:378-386）。wake_up(wing=None) 只組 L0+L1（layers.py:388-407）：parts=[]; append l0.render()（layers.py:399）; append ''（空行分隔，layers.py:400）; 若給 wing 則設 self.l1.wing=wing 做專案專屬 wake-up（layers.py:403-404）; append l1.generate()（layers.py:405）; 最後 '\n'.join(parts)。刻意排除 L2/L3——它們是 recall()/search() 按需呼叫（layers.py:409-415）。CLI 進入點 cmd_wakeup()（cli.py:932-943）建 MemoryStack 後印出文字並估 token=len//4。整體設計目標 docstring 寫明 wake-up ~600-900 tokens，留 95%+ context（layers.py:13）。實際 session 注入靠 MCP 協定：PALACE_PROTOCOL（mcp_server.py:1527-1534）指示 AI 'ON WAKE-UP: Call mempalace_status'，status 回應內含 AAAK_SPEC（mcp_server.py:1523-1553）。注意：hooks/ 只有 Stop / PreCompact / SessionEnd（mempal_save_hook.sh 等），沒有 SessionStart hook——所以 L0+L1 的注入不是靠 hook 自動 prepend，而是靠 AI 主動呼叫 wake-up/status，或人工把 `mempalace wake-up` 輸出貼進 system prompt。

**移植/意義**：把 wake_up() 的 join 邏輯換成『讀 identity.md + 讀 essential-story.md，用空行串起來』。session 開始時注入的就是這兩個檔案的串接。因為 mempalace 沒有 SessionStart 自動注入，純 markdown 版反而更乾淨：用一個 SessionStart hook（或 CLAUDE.md import）在 session 起始 prepend `wake.md`（= identity 區塊 + essential-story 區塊）。wing 參數對應『專案專屬 wake』——可依 cwd/專案挑不同 essential-story 檔。

**採用**：是

### 19. 分層移植成純 markdown 的整體對應（session 注入哪個檔案）

**運作方式**：關鍵洞察：mempalace 的分層本質是『按 token 成本分階載入』——L0/L1 永遠注入（低成本、常駐），L2/L3 按需拉取（高成本、對話中才觸發）。session 開始只注入 L0+L1（wake_up，layers.py:388-407）。L0 已是純檔案（identity.txt，layers.py:51-54），L1 也有純檔案生成器（dialect.generate_layer1 寫出靜態檔，dialect.py:920-922），只有 L2/L3 綁 ChromaDB。config 預設 collection = 'mempalace_drawers'（config.py:198），palace_path 從 file config 讀（config.py:335-343）。

**移植/意義**：建議映射：L0 → identity.md（常駐注入）；L1 → essential-story.md，由背景程序依 note frontmatter 權重週期重生（常駐注入）；L2 → 按專案資料夾/tag 動態載入一批 notes（對話中按需）；L3 → 全文或輕量語意搜尋工具（agent 按需呼叫）。session 開始時只注入 identity.md + essential-story.md 兩個檔（對應 wake_up 的 L0+L1），總量控制在 ~600-900 tokens。注入機制用 SessionStart hook 或 CLAUDE.md @import，而非 mempalace 現有的 MCP-protocol-靠-AI-主動-呼叫 方式（更可靠、零 token bookkeeping）。

**採用**：是　**注意**：純 markdown 版失去 mempalace 的 verbatim ChromaDB 保證與語意召回（L3）；L1 權重排序要求每則 note 手動維護 importance/weight frontmatter，否則排序退化。

### 20. Stop hook（自動存檔／每 N 則觸發）

**運作方式**：入口 shell 為 hooks/mempal_save_hook.sh，Claude Code 在每次 assistant 回應後觸發。流程：(1) 讀 stdin JSON，透過 `python -m mempalace.hook_shell parse-stop` 解析出 session_id / stop_hook_active / transcript_path（hook_shell.py:53-58）;(2) 若 stop_hook_active=true 直接 `echo {}` 放行，這是無限迴圈防護（mempal_save_hook.sh:221-224）;(3) 用 `python -m mempalace.hook_shell count-human-messages` 數 transcript 裡 role==user 的訊息數（hook_shell.py:68-94，會跳過含 <command-message> 的 slash-command 訊息）;(4) 與 state 檔 $STATE_DIR/${SESSION_ID}_last_save 比對，SINCE_LAST >= SAVE_INTERVAL(=15) 時觸發（mempal_save_hook.sh:55,248,254）;(5) 觸發時把 transcript 父目錄丟給 `mempalace mine <dir> --mode convos` 在背景挖礦（mempal_save_hook.sh:267-273），並依 MEMPAL_VERBOSE 決定回傳 {"decision":"block","reason":...} 讓 AI 存記憶、或靜默回 {}（mempal_save_hook.sh:283-294）。純 Python 版 hook_stop 做同一件事但更完整：silent 模式直接呼叫 _save_diary_direct + _ingest_transcript + _maybe_auto_ingest，只有成功存檔(count>0)才推進 last_save marker，並用 systemMessage 回報（hooks_cli.py:1108-1168）。README 表格：『Every 15 human messages → auto-mine transcript, then block AI to save』。

**移植/意義**：這是最值得照抄的骨架。改寫版：保留 shell wrapper（解析 stdin、count-human-messages、last_save 節流門檻），把 mine 那步換成『把 transcript 逐字 render 成 markdown 寫進 vault』。門檻邏輯(SINCE_LAST>=SAVE_INTERVAL 搭配 ${SESSION_ID}_last_save state 檔)可原封不動，只換掉觸發時的動作。silent 模式回 `{}` 即可，完全不需要 block AI，零 token 成本。

**採用**：是　**注意**：count-human-messages 每次 Stop 都重讀整個 JSONL（hook_shell.py:77-94），長 session 下是 O(檔案大小)；但只讀不解析全部 block，實測仍在預算內。SAVE_INTERVAL 寫死在 shell（可自行改成讀 config）。

### 21. PreCompact hook（壓縮前緊急存檔）

**運作方式**：入口 hooks/mempal_precompact_hook.sh，Claude Code 在 context 壓縮前觸發。與 Stop hook 的關鍵差異：沒有訊息計數門檻、沒有 MEMPAL_VERBOSE 分支——每次 PreCompact 都無條件 **同步（前景阻塞）** 執行 `mempalace mine <transcript-dir> --mode convos`（mempal_precompact_hook.sh:184-190，注意沒有結尾的 `&`，對比 save hook 的背景 `&`），跑完才 `echo {}` 讓壓縮繼續。理由寫在檔頭註解 mempal_precompact_hook.sh:11-16：『compaction is always worth saving before』，且要保證記憶在壓縮前落地，所以用同步而非背景。純 Python 版 hook_precompact 同理：_ingest_transcript(背景 spawn) + _mine_sync(前景、對 MEMPAL_DIR，帶 timeout=60)（hooks_cli.py:1298-1327）。解析用 `parse-precompact`（只取 session_id + transcript_path，無 stop_hook_active，hook_shell.py:61-65）。

**移植/意義**：直接沿用：markdown 版把同步 mine 換成『同步把整份 transcript render 成 markdown 落地』，跑完回 {}。PreCompact 是逐字歸檔最重要的觸發點，因為壓縮後原始逐字內容就從 context 消失了。同步執行確保寫完才壓縮。

**採用**：是　**注意**：同步執行受 harness 30s timeout 上限約束（mempal_precompact_hook.sh 註解與 _mine_sync 的 timeout=60 對比）。若 transcript 很大，markdown render 要控制在數秒內，否則會撞 timeout。這是唯一刻意違反『500ms』的路徑（見效能預算條目）。

### 22. SessionEnd hook（乾淨退出的最後一次 flush，背景化）

**運作方式**：hooks/mempal_session_end_hook.sh 補掉『短 session 從未跨過 SAVE_INTERVAL 也沒觸發 PreCompact 就結束 → 什麼都沒存』的漏洞（hooks_cli.py:1204-1209，issue #1341）。關鍵手法：Claude Code 對 SessionEnd 有 1.5s 預設 timeout 且 plugin 提供的 timeout 無法拉高，而 mempalace 冷啟就超過 1.5s，所以 shell wrapper 先 `payload=$(cat)` 抓 stdin，再把整個工作丟進 `( ... ) & disown` 背景子程序、主程序立刻 `printf '{}'` 返回（mempal_session_end_hook.sh:34-41）。背景子程序才呼叫 `mempalace hook run --hook session-end`。Python 端 hook_session_end 先做 in-process diary write 再 spawn detached mine（hooks_cli.py:1273-1291），並在 finally 清掉 ${session_id}_last_save marker（hooks_cli.py:1188-1201,1294-1295）。

**移植/意義**：markdown 版一定要有這個 hook——短對話最容易漏。照抄『抓 stdin → 背景 disown → 立即回 {}』的模式即可在 1.5s 預算內把 render 工作丟到背景。

**採用**：是　**注意**：背景 disown 在 POSIX 可靠、Windows 只有 mine 孫程序（detached flags）能存活，backgrounded hook 與 in-process write 在 Windows 是 best-effort（hooks_cli.py:1219-1223 註解，無 Windows CI）。markdown 版若要跨平台需注意。

### 23. Claude Code JSONL 解析（normalize._try_claude_code_jsonl + _extract_content）

**運作方式**：normalize.py:191-250 逐行 json.loads，用 entry['type'] 分 human/user vs assistant，訊息本體在 entry['message']['content']。核心規則：(1) assistant 訊息先建 tool_use_map: tool_use_id → tool_name（normalize.py:211-216）;(2) 只含 tool_result 的 user 訊息(is_tool_only)不當成新 user turn，而是 append 到前一則 assistant（normalize.py:218-234），連續 assistant 也 merge 成同一 turn（normalize.py:242-244）——把工具往返摺疊回單一助理回合;(3) _extract_content 處理 str / list-of-blocks / dict 三種形態，把 text/tool_use/tool_result 各自格式化（normalize.py:685-716）;(4) tool_use 轉人類可讀單行（Bash/Read/Grep/Glob/Edit/Write 各有專屬格式，normalize.py:719-760）;(5) tool_result 依工具型別裁切：Bash 取 head+tail 各 20 行、Grep/Glob 上限 20 筆、Read/Edit/Write 直接省略、未知工具 2048 bytes 上限（normalize.py:763-828）;(6) 最後 _messages_to_transcript 把 (role,text) 轉成 `> user` + assistant 的純文字格式（normalize.py:831-860）。tools/render_jsonl.py 則是一支獨立、stdlib-only、只輸出 user/assistant text（不含工具）的精簡 renderer，檔頭直接說明用途是把 JSONL render 成可保存 .txt（render_jsonl.py:1-13）。

**移植/意義**：這是 markdown 逐字歸檔的『解析引擎』本體，幾乎可整段搬。建議：以 render_jsonl.py 為起點（更乾淨、無外部依賴），再視需要把 normalize.py 的 tool_use/tool_result 格式化(719-828)搬進來，就能得到含工具往返的 markdown。輸出格式把 `> ` 改成 markdown（例如 `**User:**` / `**Assistant:**` 或 callout）即可。

**採用**：是　**注意**：normalize 的 tool_result 是刻意有損裁切（head+tail 20 行、2KB 上限），若要真正『逐字』需拿掉這些 cap（見 _TOOL_RESULT_MAX_* 常數 normalize.py:763-765）。多份格式偵測順序有先後依賴（_try_gemini_json 必須排在 Claude 之前，normalize.py:436-438），純 Claude 場景可只保留 _try_claude_code_jsonl。

### 24. 雜訊剝除（strip_noise）

**運作方式**：normalize.py:96-113 移除 Claude Code 注入的系統標籤與 UI chrome：<system-reminder>/<command-message>/<command-name>/<user-prompt-submit-hook>/<hook_output> 等 tag（_NOISE_TAGS normalize.py:43-50，每個 tag 的 regex 被 anchor 到行首且禁止跨空行，避免吃掉相鄰訊息 normalize.py:53-63）;整行雜訊前綴如 'CURRENT TIME:'、'MemPalace auto-save checkpoint.'（_NOISE_LINE_PREFIXES normalize.py:68-83）;TUI hook chrome 如 'Ran 2 Stop hook'（_HOOK_LINE_RE normalize.py:88-90）;摺疊標記 '… +N lines' 與 '[N tokens] (ctrl+o to expand)'（normalize.py:93,110）。設計原則：所有 pattern 都 line-anchored 且 case-sensitive，使用者散文提到這些字串時保持原樣（normalize.py:97-101）。此函式只在 Claude Code JSONL 解析內部套用（normalize.py:222-223,238-239），其他格式逐字放行。

**移植/意義**：markdown 版強烈建議照抄整組 regex——Claude Code transcript 塞滿 system-reminder / hook chrome，不剝掉的話 markdown 會很髒。這組 pattern 已針對 Claude Code 實際 JSONL 調校過。

**採用**：是　**注意**：若你的目標是『100% 逐字包含 hook 注入內容』，剝除反而不對；需自行取捨哪些該留（例如可能想保留 <command-name> 以記錄使用者跑了哪個 slash command）。pattern 是英文/固定字串，Claude Code 更新注入格式時要跟著維護。

### 25. Exchange-pair 切塊（chunk_exchanges）

**運作方式**：convo_miner.py:139-251。以 `>` 標記的 user turn + 其後的 AI 回應為一個單位（Q+A = 一 drawer）。偵測：整份至少 3 行以 `>` 開頭才走 exchange 切法，否則 fallback 到 paragraph 切法（convo_miner.py:166-172）。_chunk_by_exchange 逐行掃，遇 `>` 收 user turn，往下收 AI 行直到下一個 `>` 或 `---`（convo_miner.py:185-211），以 newline join 保留換行/縮排/空行結構（convo_miner.py:203-205）。_emit_bounded 做長度控制：整段 strip 後長度 <= min_chunk_size(30) 視為雜訊丟棄，否則以 CHUNK_SIZE(800 chars) 為界切成多個 drawer、逐片 verbatim 保留不丟尾（convo_miner.py:214-232，用 index-based loop 避免 O(N^2)）。room（主題）用關鍵字打分決定（technical/architecture/planning/decisions/problems，convo_miner.py:258-335）。

**移植/意義**：若 markdown vault 想要『一則對話一個 note』或『一天一個 note』的粒度，切塊邏輯可參考但不必全搬——逐字歸檔通常想要整份 transcript 一個檔，不需切成 800 字 drawer。可借用的是：exchange-pair 的邊界偵測（`>` / `---` 當分隔）與 min_chunk_size 丟雜訊的門檻。room 關鍵字打分可拿來當 markdown frontmatter 的 tag/topic 來源。

**採用**：否　**注意**：800 char CHUNK_SIZE 是為 embedding/檢索設計的，對 markdown 逐字保存反而會把一段回應硬切開。markdown 版若只要保存不要檢索，跳過切塊、整份寫檔更合適。

### 26. 效能預算守法（hooks under 500ms 的具體機制）

**運作方式**：CLAUDE.md 明列『Hooks under 500ms. Startup injection under 100ms』。守法手段散在多處：(1) **重活一律背景化**：Stop hook 的 mine 用 `&`（mempal_save_hook.sh:268）、Python 端 _spawn_mine 用 detached Popen（start_new_session / Windows CREATE_NO_WINDOW+BREAKAWAY，hooks_cli.py:27-45,472-509），hook 本身不等 mine 完;(2) **禁止從 hook 冷啟 python daemon**：_daemon_available 只做 localhost 健康探測(HOOK_PROBE_TIMEOUT)，註解明說『500ms hook budget forbids auto-starting a python subprocess from a hook (cold start ~15s)』，daemon 沒開就 fallback 直接 spawn，不阻塞（hooks_cli.py:527-544）;(3) **shell 只做輕解析**：JSON 解析與訊息計數外包給 `python -m mempalace.hook_shell`，只用 json+sys 標準庫，連 mempalace 都不必 import（hook_shell.py:1-7 檔頭 + README hooks:228）;(4) **kill-switch 早退**：_palace_root_exists() 在碰任何磁碟前短路（hooks_cli.py:48-61,1061-1063）;(5) **per-target PID slot 去重**：避免重複 Stop 疊出多個平行 mine 拖垮系統（hooks_cli.py:266-330,433-509）;(6) **SessionEnd 直接背景 disown 立即返回**（mempal_session_end_hook.sh:34-41）。唯一刻意同步阻塞的是 PreCompact（見該條目），因為正確性優先於預算。

**移植/意義**：markdown 版要照抄的三個關鍵模式：(a) Stop/SessionEnd 走背景 spawn + 立即回 {};(b) 絕不在 hook 前景做冷啟或重 I/O;(c) shell wrapper 只解析 + 計數 + 節流，實際 render 丟給子程序。若 render markdown 很快（純文字、無 embedding），甚至可考慮前景做但仍建議背景化保險。

**採用**：是　**注意**：『500ms』是針對含 embedding/ChromaDB 的重管線設定的；純 markdown render 通常遠低於此，但仍要避免同步讀超大 JSONL。PreCompact 是唯一同步路徑，要自行確保 render 在 harness 30s 內完成。

### 27. 訊息計數與節流狀態（count_human_messages + last_save marker）

**運作方式**：節流靠兩件事：(1) count_human_messages 逐行 json.loads，只數 message.role=='user' 且 content 不含 <command-message> 的訊息（hook_shell.py:68-94；Python 版 _count_human_messages 另支援 Codex event_msg 格式並處理 list content，hooks_cli.py:143-183）;(2) 每 session 一個純文字 state 檔 $STATE_DIR/${SESSION_ID}_last_save 存上次存檔時的計數，SINCE_LAST = EXCHANGE_COUNT - LAST_SAVE（mempal_save_hook.sh:238-248）。shell 對 LAST_SAVE 做整數正則驗證防注入（mempal_save_hook.sh:243）。Python 版只有成功存檔(count>0)才推進 marker，避免存檔失敗後永遠不重試（hooks_cli.py:1136-1141）。session 結束時清 marker（hooks_cli.py:1188-1201）。

**移植/意義**：若 markdown 版想『每 N 則才寫一次檔』而非每次 Stop 都寫，這套 last_save marker + count-human-messages 可原封不動用。但逐字歸檔更常見的做法是每次都覆寫同一份 markdown（deterministic 檔名 = session_id），此時計數只用來決定要不要重 render，不需要 block。

**採用**：是　**注意**：逐字歸檔若採『每次覆寫整份』策略，其實不太需要計數節流——只要在 SessionEnd/PreCompact 各寫一次即可。計數主要價值在避免高頻 render 的效能浪費。

### 28. 專案 wing 推導與 transcript 路徑安全驗證

**運作方式**：(1) **從 JSONL 的 cwd 推導專案名**：_wing_from_jsonl_cwd 掃前 200 行找第一個帶非空 'cwd' 的記錄，取其 leaf path segment 當專案 slug（hooks_cli.py:954-991）;fallback 才解碼 .claude/projects/ 底下被 flatten 成 dash 的資料夾名（hooks_cli.py:994+）。因為 Claude Code 把 /Users/me/code/foo 編碼成 -Users-me-code-foo 會失去目錄邊界，讀 cwd 是唯一可靠來源。(2) **路徑驗證**：_validate_transcript_path 要求副檔名 .jsonl/.json、resolve 後拒絕含 '..' traversal（hooks_cli.py:124-140）;shell 端 is_valid_transcript_path 鏡像同規則（mempal_save_hook.sh:206-217）;session_id 只允許 alnum/dash/underscore 防 path traversal（hook_shell.py:16-23, hooks_cli.py:118-121）;normalize_transcript_path 保留 Windows drive-letter 與反斜線只去控制字元（hook_shell.py:26-41）。

**移植/意義**：markdown vault 幾乎一定想『按專案分資料夾』，_wing_from_jsonl_cwd 的『讀 JSONL cwd 取 leaf』正是決定 vault 子目錄的最佳來源，直接搬。路徑驗證與 session_id sanitize 也該照抄——你要用 session_id 當 markdown 檔名，防 traversal 是必要的。

**採用**：是　**注意**：wing slug 會把空格/dash 轉底線、加 'wing_' 前綴（hooks_cli.py:987-988），markdown 版可自訂前綴或改用原始資料夾名。cwd 掃描上限 200 行，極端情況(前 200 行都無 cwd)會 fallback 到路徑解碼。

### 29. 直接寫入路徑範本（_save_diary_direct / _ingest_transcript 的呼叫慣例）

**運作方式**：silent 模式的 Stop/SessionEnd 不 block AI，而是在 hook 程序內直接落地：_save_diary_direct 抽最近 N(=30) 則 user 訊息（_extract_recent_messages 會濾掉 <command-message>/<system-reminder>，hooks_cli.py:686-722）、用 _extract_themes 以停用詞過濾抽 2-3 個主題詞（hooks_cli.py:737-751），組成 CHECKPOINT 字串寫進 palace（hooks_cli.py:754-849）;_ingest_transcript 則把整份 transcript 背景 mine（hooks_cli.py:852-906）。輸出用 _output 直接寫 fd 1（繞過可能被 MCP 重導的 sys.stdout，hooks_cli.py:216-245），並可選 systemMessage 回報『N memories woven』（hooks_cli.py:1147-1151）。

**移植/意義**：這是『在 hook 內直接完成存檔、零 token、不打擾對話』的完整範本。markdown 版把 _save_diary_direct 的內容換成『render transcript → 寫 .md 到 vault』即可：沿用 _extract_recent_messages 濾雜訊、_extract_themes 產生 frontmatter tag、_output 回 systemMessage 給使用者一行確認。

**採用**：是　**注意**：_extract_themes 的停用詞是英文-only（hooks_cli.py:725-734, 738-741 註解明說非英文語料會產生噪音 theme），中文 vault 需換斷詞/停用詞。_extract_recent_messages 只取 user 訊息且截斷 200 字（hooks_cli.py:709），逐字歸檔要改成完整雙方對話。

### 30. Temporal KG schema：entities + triples 兩張 SQLite 表，事實即 (subject, predicate, object) + [valid_from, valid_to] 半開區間

**運作方式**：knowledge_graph.py:142-176 的 `_init_db` 建兩張表。`entities`（id/name/type/properties JSON/created_at）是節點；`triples`（knowledge_graph.py:155-170）是帶時間性的邊：欄位 `subject`、`predicate`、`object` 三個外鍵指回 entities.id，加上 `valid_from TEXT`、`valid_to TEXT`、`confidence REAL DEFAULT 1.0`，以及溯源欄位 `source_closet/source_file/source_drawer_id/adapter_name/extracted_at`。entity id 由 `_entity_id`(knowledge_graph.py:219-220) 正規化 name（小寫、空白→底線、去單引號）產生，所以 'Max' 與 'max' 折成同一節點。triple id 由 ids.py:111-128 `make_triple_id` 產生 `t_{sub}_{pred}_{obj}_{sha256(valid_from|recorded_at)[:12]}`。`add_triple`(knowledge_graph.py:237-328) 會 INSERT OR IGNORE 自動建立缺席的 subject/object 節點，predicate 也正規化（小寫、空白→底線，line 282）。時間值一律經 config.py:138-172 `sanitize_iso_temporal` 驗證，只接受 `YYYY-MM-DD` 或 canonical UTC `YYYY-MM-DDTHH:MM:SSZ`，`+00:00` 正規化為 `Z`；partial date 被拒（因為查詢用 TEXT 字串比較）。查詢語意是「as_of 時間點落在區間內」：`_temporal_filter_sql`(knowledge_graph.py:106-126) 產生 `(valid_from IS NULL OR valid_from<=?) AND (valid_to IS NULL OR valid_to>=?)`；date-only 值在比較時被撐成整日（valid_from→T00:00:00Z、valid_to→T23:59:59Z，見 line 84-103 的 SQL CASE 與 line 56-81 的 Python 對應），讓 legacy 純日期事實與 UTC datetime 查詢共存。`query_entity`(364-427) 支援 outgoing/incoming/both 方向遍歷並回傳 `current = valid_to is None`。

**移植/意義**：每個 entity 一個 note，事實放在 YAML frontmatter 底下的一張 markdown 表格：`| predicate | object | valid_from | valid_to | confidence | source |`。node 身分用檔名/wikilink（[[Max]]）取代 entity id 正規化；object 也用 wikilink 讓雙向遍歷靠 backlinks 免費得到（等同 incoming 查詢）。frontmatter 放節點級屬性（type、aliases、birthday）。「as_of 查詢」= 讀表後過濾 `valid_from <= T AND (valid_to 為空 OR valid_to >= T)`，可用 Obsidian Dataview/Bases 的 filter 或 formula 實作；日期一律存 ISO `YYYY-MM-DD` 或 `YYYY-MM-DDTHH:MM:SSZ` 以保證字串排序等於時間排序。

**採用**：是　**注意**：字串比較能成立完全依賴嚴格的 canonical 格式（sanitize 強制）；若人手編輯 frontmatter 混入 partial date 或本地時區，as_of 過濾會靜默給錯結果。純 markdown 無外鍵約束，subject/object 拼寫漂移會分裂節點——需靠 alias 正規化補。

### 31. 事實 invalidate 而非刪除：把開放區間 `valid_to IS NULL` 收束成一個結束時間戳，歷史 row 永久保留

**運作方式**：`invalidate`(knowledge_graph.py:330-360) 不做 DELETE，而是 `UPDATE triples SET valid_to=? WHERE subject=? AND predicate=? AND object=? AND valid_to IS NULL`（line 356-359）。`ended` 預設 `date.today()`，同樣經 sanitize。更新前先撈出所有仍開放（valid_to IS NULL）的匹配 row，逐一檢查 `ended` 不早於該 row 的 valid_from（line 346-354），否則丟 ValueError 拒絕製造倒置區間（「invisible to every KG query」）。關鍵不變量：`valid_to IS NULL` = 目前仍成立的事實。這個不變量同時是去重鍵——`add_triple`(line 298-303) 在插入前查 `WHERE subject=? AND predicate=? AND object=? AND valid_to IS NULL`，若已有相同且仍有效的 triple 就直接回傳既有 id，不重覆插入。add_triple 本身也用同一個 `_temporal_end_key < _temporal_start_key` 檢查（line 270-278）拒絕倒置區間。`stats`(506-527) 用 `valid_to IS NULL` 數 current_facts，其餘為 expired_facts——過期事實仍在庫內、可被 as_of 歷史查詢或 `timeline`(464-502) 依 valid_from 排序取回。這就是 bi-temporal / 事實作廢模型：更正一個事實 = 對舊 row 設 valid_to（作廢）+ add_triple 一條新的開放 row。

**移植/意義**：作廢 = 在該事實那一列填入 `valid_to`（原本留空代表『現在仍成立』），絕不刪列。更正一個屬性 = 舊列填 valid_to、再 append 一新列 valid_to 留空。可加一個 `current` 衍生欄（valid_to 是否為空）方便渲染；『目前為真的事實』= 篩 valid_to 空白的列。去重規則照搬：append 前先掃表，若已存在相同 predicate+object 且 valid_to 空白就不重覆加。倒置區間檢查（valid_to < valid_from 報錯）也值得保留成 lint 規則。

**採用**：是　**注意**：純 markdown 無交易/鎖，這裡是 SQLite `with conn:` 交易 + threading.Lock 保護（line 285-287）；多來源並發改同一 note 需靠檔案層協調。valid_to 語意是右閉（date-only 撐到 23:59:59Z），移植時整個區間比較語意要一致，否則邊界日的事實會被錯誤納入或排除。

### 32. Entity 消歧：三層優先來源 registry + 上下文樣式打分（名字 vs 常用字），把 'Max/Grace/Will' 這類與英文常用字撞名的詞辨清

**運作方式**：entity_registry.py 的 EntityRegistry 存於 `~/.mempalace/entity_registry.json`，schema 見 line 278-297：`people`（每人 source/contexts/aliases/relationship/confidence/可選 canonical）、`projects`、`ambiguous_flags`、`wiki_cache`。三來源優先序（檔頭 line 6-9 與 `lookup` line 448-509）：(1) onboarding 顯式輸入 confidence=1.0，(2) learned 從歷史推斷，(3) researched 走 Wikipedia。`lookup` 依序比對 people→projects→wiki_cache，全落空回 unknown。消歧核心在 `_disambiguate`(511-552)：當某名字同時是註冊人名且落在 `ambiguous_flags`（即 line 32-87 的 COMMON_ENGLISH_WORDS，如 ever/grace/will/max/rose）時，拿 context 句子分別對 PERSON_CONTEXT_PATTERNS(90-111，如 `{name} said`、`with {name}`、`{name}'s`、`my daughter {name}`) 與 CONCEPT_CONTEXT_PATTERNS(114-125，如 `have you {name}`→'have you ever'、`{name} since`→'ever since') 計分；person_score>concept_score 判人（信心 min(0.95, 0.7+n*0.1)），反之判 concept，平手回 None 落回註冊人名。`seed`(396-444) 建 registry 時自動把落在 COMMON_ENGLISH_WORDS 的名字加進 ambiguous_flags(437-442)，並用 reverse_aliases 讓 Maxwell↔Max 互指（canonical 欄位）。未知字才升級到 `research`(556-594)——預設 local-only、`allow_network=True` 才打 Wikipedia REST(`_wikipedia_lookup` 177-265，靠 NAME_INDICATOR_PHRASES/PLACE_INDICATOR_PHRASES 與 disambiguation page 推 type+confidence)，結果進 wiki_cache 且預設 unconfirmed。上游 entity_detector.py 用訊號打分決定一個候選是 person/project/uncertain：`extract_candidates`(273-331) 抽 3 次以上的大寫候選、先做 known-systems compound pre-pass(138-170) 把 'Claude Code' 整體遮罩免被拆、再過 COCA content-word 濾網(62-78) 濾掉 Code/Phase 等假陽性；`score_entity`(385-465) 累加 dialogue(x3)/person verb(x2)/pronoun proximity(x2)/direct address(x4) vs project verb/versioned/code_ref；`classify_entity`(471-546) 要求 person_ratio>=0.7 且『兩種不同訊號類別』(line 493-521) 才升 person，避免單一句法位置刷分。KG 端 entity 折疊則靠 `_entity_id` 正規化（knowledge_graph.py:219）。

**移植/意義**：registry → 一個 `entities/` 資料夾每 entity 一 note，frontmatter 放 `type/source/confidence/aliases/relationship`；ambiguous 名字加一個 `ambiguous: true` 或 tag。消歧的上下文樣式表可整組搬成一份規則清單（PERSON vs CONCEPT patterns），寫入時對句子跑一次決定要不要 wikilink 這個詞。aliases 用 Obsidian 的 `aliases:` frontmatter 原生欄位，Maxwell↔Max 直接靠它解析。wiki_cache/unconfirmed 對應一個 `needs-review` tag 待人工確認。COMMON_ENGLISH_WORDS 與 COCA 濾網可存成 skill 附帶的 data JSON。

**採用**：是　**注意**：消歧是規則/正則式而非模型，僅覆蓋英文樣式（PERSON_CONTEXT_PATTERNS 全英文），多語要各自補；純 markdown 沒有 confidence 傳播與去重的程式邏輯，需在 ingest skill 端重現。Wikipedia lookup 違反 local-first，移植成 vault 時應維持預設關閉。

### 33. 把整套時間性事實模型落成 markdown：frontmatter 存節點屬性 + 一張『時間性事實表』存邊，valid_to 空白=現在，作廢=填 valid_to

**運作方式**：綜合三檔：SQLite 的 entities 表 = 每個 entity note 的 frontmatter；triples 表 = note 內一張表格，每列一條 (predicate, object, valid_from, valid_to, confidence, source)。`current` 衍生欄對應 knowledge_graph.py 各查詢的 `row['valid_to'] is None`（line 401/423/459/499）。雙向遍歷（query_entity direction=both, line 364-427）在 markdown 用 wikilink object + Obsidian backlinks 自然達成：outgoing = 本 note 表格；incoming = 反向連結面板。as_of 時間查詢對應 `_temporal_filter_sql` 的區間判斷，可用 Dataview/Bases formula 過濾。timeline(464-502) 對應把全 vault 事實列依 valid_from 排序的一個 Base view。去重與作廢不變量（valid_to IS NULL 唯一代表現行）直接搬成編輯規則。

**移植/意義**：範例 entity note（Max.md）：frontmatter `type: person / aliases: [Maxwell] / birthday: 2015-04-01 / source: onboarding / confidence: 1.0`；正文一張表 `| predicate | object | valid_from | valid_to | confidence | source |` 例如 `| child_of | [[Alice]] | 2015-04-01 | | 1.0 | onboarding |`、`| does | [[swimming]] | 2025-01-01 | | 1.0 | |`、`| has_issue | [[sports_injury]] | 2026-01-01 | 2026-02-15 | 1.0 | |`（最後一列 valid_to 已填=已作廢）。日期一律 ISO 字串保證排序=時序。用 obsidian-bases 建三個 view：Current facts（valid_to 空）、As-of（依輸入日期 filter）、Timeline（依 valid_from 排序）。ingest skill 負責正規化名字/aliases、append-only 寫入、作廢時填 valid_to 而非刪列、倒置區間 lint。

**採用**：是　**注意**：markdown 缺 SQLite 的交易性、外鍵、字串比較索引與並發鎖；大量事實下 as_of/timeline 過濾靠 Dataview/Bases 逐檔掃描，效能遠不如 SQLite 索引（idx_triples_valid 等，line 172-175）。日期格式紀律得靠 skill 強制，否則字串比較的時間語意崩壞。此為 append-only 設計，note 會單調增長，需要 view 折疊而非刪除來維持可讀性。

