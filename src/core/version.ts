/** EleGent 的單一版本真理來源——CLI `version` 子指令、發佈產物命名等都從這裡讀取。 */
export const VERSION = "0.3.0";

/**
 * 判斷目前執行環境是否為 Task 26 編譯出的單一執行檔（而非 `bun src/presentation/cli/elgt.ts`
 * 直接跑的開發模式）。elgt.ts 的 `resolveElegentBin`（寫進模板的執行檔路徑）與
 * autodistil.ts 的 `buildDistilCmd`（headless distil 的 allowedTools）都需要這個判斷，
 * 因此抽成這裡的共用函式，避免各自维护一份後綴清單。
 *
 * 主要依據：`scripts/build.ts` 用 `bun build --compile ... --define
 * "process.env.ELEGENT_COMPILED='1'"` 把這個環境變數字面編進編譯產物本身——只要讀到
 * `ELEGENT_COMPILED === "1"` 就直接判定為 compiled，不看 execPath。這個值是編譯期烙印
 * 的常數，不受執行當下的 shell 環境影響，也不受各平台 bun 執行檔命名影響。
 *
 * Fallback（開發模式沒有這個 define）：退回舊的執行檔路徑後綴比對——
 * `process.execPath` 以 `/bun`、`/bun.exe`、`\bun.exe` 結尾視為開發模式（bun 本身）；
 * 其餘一律視為 compiled。這只是 fallback、非可靠依據——npm 版 bun 在部分平台的實際
 * 執行檔路徑不一定以這三種後綴結尾，會被誤判為 compiled，因此真正需要精準判斷的
 * 呼叫端應仰賴上面的 ELEGENT_COMPILED define，而不是這個後綴比對。
 *
 * `execPath` 參數預設 `process.execPath`，僅供測試注入。
 */
export function isCompiledRuntime(execPath: string = process.execPath): boolean {
  if (process.env.ELEGENT_COMPILED === "1") return true;
  return !(execPath.endsWith("/bun") || execPath.endsWith("/bun.exe") || execPath.endsWith("\\bun.exe"));
}
