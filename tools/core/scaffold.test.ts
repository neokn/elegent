import { expect, test } from "bun:test";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldVault } from "./scaffold";
import { nodeFileStore } from "@infrastructure/node-fs";

test("建立完整骨架且冪等、不覆寫既有檔", () => {
  const root = mkdtempSync(join(tmpdir(), "vault-"));
  const created = scaffoldVault(nodeFileStore, root);
  expect(created.length).toBeGreaterThan(5);
  expect(existsSync(join(root, "palace/wake/identity.md"))).toBe(true);
  expect(existsSync(join(root, ".obsidian/app.json"))).toBe(true);
  expect(readFileSync(join(root, "index.md"), "utf8")).toContain("okf_version");

  writeFileSync(join(root, "palace/wake/identity.md"), "改過的內容");
  const second = scaffoldVault(nodeFileStore, root);
  expect(second).toEqual([]);
  expect(readFileSync(join(root, "palace/wake/identity.md"), "utf8")).toBe("改過的內容");
});
