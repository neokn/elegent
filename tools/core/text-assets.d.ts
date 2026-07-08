// Bun 支援用 `with { type: "text" }` import attribute 把任意副檔名的檔案當純文字
// 內嵌（見 tools/core/templates.ts）。bun-types 只內建 .txt/.toml/.yaml/.json5 等
// 副檔名的環境宣告，這裡補上本專案模板資產實際用到的 .md / .tmpl，讓 tsc 不誤判
// 「找不到模組」。
declare module "*.md" {
  const contents: string;
  export default contents;
}

declare module "*.tmpl" {
  const contents: string;
  export default contents;
}
