# 設計：三向全域改名 digest→distil / palace→pensieve / raw→ankipan

- **Status:** Draft（待使用者審查）
- **Date:** 2026-07-14
- **Author:** Neo Kusanagi（with Claude）

## Context / Goal

把 EleGent 三個深埋在使用者可見行為裡的名字換掉，統一新命名學（Harry Potter
「儲思盆 Pensieve」＋哆啦A夢「記憶吐司 ankipan」＋「蒸餾 distil」）：

- `digest → distil`（蒸餾流程／skill／指令）
- `palace → pensieve`（記憶宮殿 → 儲思盆）
- `raw → ankipan`（原始底稿層 → 暗記パン）

這是一次**機械但橫跨全 repo** 的改名。最大風險不在「改了什麼」，而在「誤改了不該改的」
（尤其 `raw` 是常見子字串）。因此本 spec 的核心是 §3 命名契約 + §4 護欄。

## 1. 決策（使用者已拍板）

| # | 決策 | 選擇 |
|---|---|---|
| 1 | 改動範圍 | **全面改，含程式內部識別字、env var、state 檔名** |
| 2 | `raw-log` frontmatter 型別 | **保留**（`NOTE_TYPES` 不動，避免既有 note lint fail） |
| 3 | 既有 live vault / state | **直接重建，不 migrate**（不寫遷移碼、不附搬移片段） |
| 4 | 拼寫 / 舊 alias | **`distil`（單 L）＋ 不保留舊觸發詞**（收斂為「蒸餾/distil」） |

## 2. 前置狀態

- ADR-0007 收尾 WIP 已於 commit `f42ee20` 獨立收好，工作區乾淨。
- 改名前綠色基準：`bun test` = 284 pass / 0 fail。

## 3. 命名契約（唯一事實來源）

### 3.1 digest → distil

| 類別 | 舊 | 新 |
|---|---|---|
| slash 指令 | `/digest` | `/distil` |
| skill frontmatter / 標題 | `name: digest`／`# Digest` | `name: distil`／`# Distil` |
| skill 觸發詞 | 消化 / 蒸餾 / digest / 整理記憶 | **蒸餾 / distil**（移除消化、digest；整理記憶可留作描述） |
| asset 檔 | `src/assets/skill-digest.md` | `src/assets/skill-distil.md` |
| template 鍵 / import | `TemplateName "skill-digest"`／`import skillDigest` | `"skill-distil"`／`skillDistil` |
| dogfood skill 目錄 + symlink | `.claude/skills/digest/`、`.agents/skills/digest/`（symlink→`skill-digest.md`） | `…/distil/`（symlink→`../../../src/assets/skill-distil.md`） |
| init 產出 rel 路徑（bootstrap.ts） | `.claude\|.codex\|.agents/skills/digest/SKILL.md` | `…/skills/distil/SKILL.md` |
| infra 檔 | `src/infrastructure/autodigest.ts`＋`.test.ts` | `autodistil.ts`＋`.test.ts` |
| 識別字 | `spawnAutoDigest`／`maybeAutoDigest`／`digestCwd`／`MaybeAutoDigestOpts`／`buildDigestCmd`／`shouldSpawnDigest` | 對應 `…Distil…` |
| env var | `ELEGENT_AUTO_DIGEST`／`ELEGENT_HEADLESS_DIGEST` | `ELEGENT_AUTO_DISTIL`／`ELEGENT_HEADLESS_DISTIL` |
| state 檔 | `.elegent-state/digest-cursor`、`digest.lock`（`LOCK_FILE`）、`autodigest.log`（`LOG_FILE`） | `distil-cursor`、`distil.lock`、`autodistil.log` |

### 3.2 palace → pensieve

- 目錄：`vault/palace/` → `vault/pensieve/`；`palace/map.md` → `pensieve/map.md`；`palace/wake/` → `pensieve/wake/`。
- 所有 `palace/…` 路徑字面與路徑常數（lint / scaffold / transcript / wake / mcp server / bootstrap）。
- 概念名：「記憶宮殿 / Memory Palace」→「**儲思盆 / Pensieve**」；`Palace Map` → `Pensieve Map`。
- MCP server `instructions` 文字內的 `palace/`。

### 3.3 raw → ankipan（**只有指涉 palace/raw 目錄者**）

- 路徑：`palace/raw` → `pensieve/ankipan`（`palace/raw/conversations/…` → `pensieve/ankipan/conversations/…`）。
- 指涉該目錄的識別字：`checkRawImmutable`→`checkAnkipanImmutable`、`rawPath`→`ankipanPath`、`rawRoot`→`ankipanRoot`、`setupRawRepo`→`setupAnkipanRepo`（測試 helper）。
- 概念名：「原始底稿 / raw 層 / append-only 底稿」→「**記憶吐司 / ankipan**」（識別字與目錄用羅馬字 `ankipan`，中文散文用「記憶吐司」）。

## 4. 護欄——**絕不改**（全域改名最易誤傷）

- **`raw-log`**：frontmatter 型別字面。含 `src/core/domain/frontmatter.ts` 的 `NOTE_TYPES`、`transcript.ts` 的 `type: "raw-log"`、所有 tests 的 `type: raw-log`、docs 中指「型別 raw-log」處。全部原字保留（決策 2）。
- **`rawText` 及泛指「原始字串」的識別字**（與 palace/raw 目錄無關者）——保留。
- **`.elegent-state/` 目錄名、`hooks.log`、`elegent` / `elgt`**——保留（只有含 digest 的檔名改）。
- `wake`、PARA 名（projects / areas / resources / archives）、保留檔 `index.md` / `log.md`、其餘 `type` 詞彙（note / moc / entity / daily）——保留。

## 5. 檔案系統操作

1. `git mv src/assets/skill-digest.md src/assets/skill-distil.md`
2. `git mv src/infrastructure/autodigest.ts src/infrastructure/autodistil.ts`；同 `autodigest.test.ts`。
3. dogfood skill 目錄改名 + symlink 重指：
   - `.claude/skills/digest/` → `.claude/skills/distil/`，`SKILL.md` symlink → `../../../src/assets/skill-distil.md`
   - `.agents/skills/digest/` → `.agents/skills/distil/`，同上
   - （`.codex/skills/digest/` 已於 `f42ee20` 移除，無需處理）
4. 其餘為檔案內容的字串/識別字替換（見 §3 契約）。

## 6. 驗證（改完必過）

1. `bun test`（目標仍 284 pass / 0 fail，或因檔名/測試名調整而數字不變質）
2. `bun run build` → `bun run smoke`
3. `src/architecture.test.ts` 依賴方向不破（改名不應動到依賴邊界）
4. 重建本地 vault：刪 `./vault` → `bun run scaffold` → `bun run lint:vault` 0 warnings
5. **殘留掃描**：`git grep -i 'digest\|palace' ':(exclude)dist'` 應為空；`git grep -nw raw` 剩下的必須逐一確認都是護欄項（`raw-log` / `rawText` / 泛指原始字串）。

## 7. Out of scope

- 不寫 `elgt migrate`、不提供既有 vault 搬移片段（決策 3）。
- 不保留舊觸發詞 alias（決策 4）。
- `raw-log` 型別詞彙不動（決策 2）。

## 8. 執行方式

ultracode 下以 **Workflow** 執行：依檔案群組 fan-out 改名（core / infrastructure /
presentation / assets / docs / dogfood config），每組改完即產結構化「已改/殘留」回報；
再跑一輪對抗式驗證（§6 全跑 + 殘留 grep 交叉比對護欄清單）。最後單一 commit 收尾，
並更新 memory 專案筆記。
