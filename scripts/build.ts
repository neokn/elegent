import { statSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const ENTRY = join(REPO_ROOT, "tools/presentation/cli/elgt.ts");
const OUTFILE = join(REPO_ROOT, "dist/elgt");
const TARGET = "bun-darwin-arm64";

/**
 * Task 26 build script：`bun run build` → `bun build --compile` 把整個 CLI（含所有
 * `import ... with { type: "text" }` 內嵌的模板資產）打包成單一原生執行檔，讓使用者
 * 免安裝 bun 就能跑 `elgt init`。
 *
 * `--define "process.env.ELEGENT_COMPILED='1'"` 把這個環境變數字面編進編譯產物本身——
 * tools/lib/version.ts 的 `isCompiledRuntime` 據此判斷「目前是不是 Task 26 編譯出的
 * 執行檔」，比後綴比對（`execPath` 是否以 `/bun` 結尾）更可靠，不受各平台 bun 執行檔
 * 命名影響。
 *
 * 只鎖定 bun-darwin-arm64（Task 26 範圍）：其餘平台留給未來任務擴充 matrix。
 */
function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function main(): number {
  console.log(`building ${OUTFILE}（target=${TARGET}）...`);
  const result = Bun.spawnSync(
    [
      "bun",
      "build",
      "--compile",
      `--target=${TARGET}`,
      ENTRY,
      "--outfile",
      OUTFILE,
      "--define",
      "process.env.ELEGENT_COMPILED='1'",
    ],
    { cwd: REPO_ROOT, stdout: "inherit", stderr: "inherit" },
  );

  if (result.exitCode !== 0) {
    console.error(`build 失敗：bun build 回傳 exit code ${result.exitCode}`);
    return 1;
  }

  const size = statSync(OUTFILE).size;
  console.log(`已產出 ${OUTFILE}（${formatSize(size)}）`);
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
