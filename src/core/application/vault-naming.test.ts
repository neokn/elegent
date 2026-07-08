import { expect, test } from "bun:test";
import { deriveVaultMode, vaultDirName, resolveVaultDir } from "@core/application/vault-naming";

test("deriveVaultMode：任一 local → local；任一 project → project；否則 standalone", () => {
  expect(deriveVaultMode("local", "none", "none")).toBe("local");
  expect(deriveVaultMode("none", "local", "none")).toBe("local");
  expect(deriveVaultMode("none", "none", "local")).toBe("local");
  expect(deriveVaultMode("project", "user", "none")).toBe("project");
  expect(deriveVaultMode("none", "none", "project")).toBe("project");
  expect(deriveVaultMode("user", "none", "none")).toBe("standalone");
  expect(deriveVaultMode("none", "none", "none")).toBe("standalone");
});

test("vaultDirName：local 隱藏 + slug、project 可見 + slug（basename 剝點）", () => {
  expect(vaultDirName("local", "/x/My App")).toBe(".my-app.vault");
  expect(vaultDirName("project", "/x/My App")).toBe("my-app.vault");
  expect(vaultDirName("local", "/x/.config")).toBe(".config.vault");
  expect(vaultDirName("project", "/x/.config")).toBe("config.vault");
});

test("vaultDirName：standalone 用 vaultName（預設 vault）", () => {
  expect(vaultDirName("standalone", "/x/whatever")).toBe("vault");
  expect(vaultDirName("standalone", "/x/whatever", "my memory")).toBe("my-memory");
});

test("vaultDirName：basename 退化（空 slug）→ project vault / local .vault", () => {
  expect(vaultDirName("project", "/")).toBe("vault");
  expect(vaultDirName("local", "/")).toBe(".vault");
});

test("resolveVaultDir：回絕對路徑（join targetDir）", () => {
  expect(resolveVaultDir("local", "/x/app")).toBe("/x/app/.app.vault");
});
