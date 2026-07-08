import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Explicit Architecture 的依賴規則，用測試強制（不是靠 code review）：
 *   依賴一律「向內」指。core（Application Core）是最內層，不得依賴 presentation/infrastructure；
 *   infrastructure（secondary／driven adapter 那一側）不得反向依賴 presentation（primary／driving 那一側）；
 *   presentation 是組裝根（composition root），可 import 任何一層並注入 infrastructure 實作。
 *
 * 跨 block import 一律走 @core/@presentation/@infrastructure 別名，這裡連相對路徑繞過
 * （`../presentation/` 等）一起擋。任何違規讓 `bun test` 失敗——這正是當初 `lib/bootstrap`
 * 反向 import `cli/scaffold` 那類問題再長出來時的防線。
 */

const TOOLS = new URL(".", import.meta.url).pathname; // tools/

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...tsFiles(p));
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

function offenders(block: string, forbidden: RegExp): string[] {
  // 只查生產碼；測試檔本身就是迷你組裝根，允許注入 infrastructure adapter（如 nodeFileStore）驗真行為。
  return tsFiles(join(TOOLS, block))
    .filter((f) => !f.endsWith(".test.ts"))
    .filter((f) => forbidden.test(readFileSync(f, "utf8")))
    .map((f) => relative(TOOLS, f));
}

test("core 不得依賴 presentation 或 infrastructure（core 是最內層）", () => {
  expect(
    offenders("core", /from ["'](?:@presentation\/|@infrastructure\/|(?:\.\.\/)+(?:presentation|infrastructure)\/)/),
  ).toEqual([]);
});

test("infrastructure 不得依賴 presentation（secondary adapter 不反向叫 UI）", () => {
  expect(offenders("infrastructure", /from ["'](?:@presentation\/|(?:\.\.\/)+presentation\/)/)).toEqual([]);
});

test("core 生產碼不得直接碰 fs/spawn/os（I/O 與環境知識一律經 port，由 infrastructure 注入）", () => {
  // 擋 `from "node:fs"`／`from "node:os"`（homedir 之類的環境／磁碟佈局知識）與 `Bun.spawn…(`。
  // node:path 是純字串運算、允許。避免誤傷註解：只比對 import 與呼叫形式。
  expect(offenders("core", /from ["']node:(?:fs|os)["']|Bun\.spawn\w*\(/)).toEqual([]);
});
