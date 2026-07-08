import type { ProcessRunner } from "@core/ports";

/** ProcessRunner 的 Bun.spawnSync 實作（唯一實作）。 */
export const nodeProcessRunner: ProcessRunner = {
  run: (cmd, opts) => {
    const r = Bun.spawnSync(cmd, { cwd: opts?.cwd, env: opts?.env ?? process.env });
    return {
      exitCode: r.exitCode,
      stdout: r.stdout?.toString() ?? "",
      stderr: r.stderr?.toString() ?? "",
    };
  },
};
