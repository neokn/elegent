import type { GitRunner } from "@core/ports";

/**
 * GitRunner 的 Bun.spawnSync 實作（secondary adapter）。明確傳 env: process.env——讓呼叫端／測試
 * 在同一行程內動態調整 GIT_AUTHOR_*／GIT_CONFIG_* 等變數能反映到 git 子行程。
 */
function run(cmd: string[], cwd: string): { exitCode: number; stdout: string; stderr: string } {
  const r = Bun.spawnSync(cmd, { cwd, env: process.env });
  return { exitCode: r.exitCode, stdout: r.stdout?.toString() ?? "", stderr: r.stderr?.toString() ?? "" };
}

function outcome(r: { exitCode: number; stderr: string }): { ok: boolean; detail: string } {
  return { ok: r.exitCode === 0, detail: r.stderr.trim() || `exit ${r.exitCode}` };
}

export const nodeGitRunner: GitRunner = {
  init: (dir) => outcome(run(["git", "init", "-b", "main"], dir)),
  stageAll: (dir) => outcome(run(["git", "add", "-A"], dir)),
  commit: (dir, message) => outcome(run(["git", "commit", "-m", message], dir)),
  diffNameStatus: (cwd, path) => {
    const r = run(["git", "diff", "--name-status", "HEAD", "--", path], cwd);
    return { ok: r.exitCode === 0, lines: r.stdout, detail: r.stderr.trim() || `exit ${r.exitCode}` };
  },
};
