import { basename, join } from "node:path";
import { slugify } from "@core/domain/safety";
import type { AgentConfigScope } from "@core/application/bootstrap";

export type VaultMode = "standalone" | "project" | "local";

/**
 * vault 放置模式由三個 agent scope 推導：
 * 任一 local → 嵌入隱藏；任一 project → 嵌入可見；否則（user/none）→ 使用者命名的獨立 vault。
 */
export function deriveVaultMode(
  claudeScope: AgentConfigScope,
  codexScope: AgentConfigScope,
  agyScope: AgentConfigScope,
): VaultMode {
  if (claudeScope === "local" || codexScope === "local" || agyScope === "local") return "local";
  if (claudeScope === "project" || codexScope === "project" || agyScope === "project") return "project";
  return "standalone";
}

/** vault 目錄名（相對 targetDir）。slugify 已移除所有點，故 base 天然無開頭點。 */
export function vaultDirName(mode: VaultMode, targetDir: string, vaultNameOpt?: string): string {
  if (mode === "standalone") return slugify(vaultNameOpt?.trim() || "vault") || "vault";
  const base = slugify(basename(targetDir));
  if (mode === "local") return base ? `.${base}.vault` : ".vault";
  return base ? `${base}.vault` : "vault"; // project
}

export function resolveVaultDir(mode: VaultMode, targetDir: string, vaultNameOpt?: string): string {
  return join(targetDir, vaultDirName(mode, targetDir, vaultNameOpt));
}
