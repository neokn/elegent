import { expect, test } from "bun:test";
import { availableScopeOptions, scopeStepDefault } from "./init-ui";

test("availableScopeOptions：尚未選任何 scope 時四個選項齊全", () => {
  const options = availableScopeOptions([]);
  expect(options.map((o) => o.value).sort()).toEqual(["local", "none", "project", "user"].sort());
});

test("availableScopeOptions：前面選過 local → 只剩 local/none（不能混 project/user）", () => {
  const options = availableScopeOptions(["local"]);
  expect(options.map((o) => o.value).sort()).toEqual(["local", "none"]);
});

test("availableScopeOptions：前面選過 project → 排除 local（project/user/none 仍可選）", () => {
  const options = availableScopeOptions(["project"]);
  expect(options.map((o) => o.value).sort()).toEqual(["none", "project", "user"].sort());
});

test("availableScopeOptions：前面選過 user → 排除 local", () => {
  const options = availableScopeOptions(["user"]);
  expect(options.map((o) => o.value).sort()).toEqual(["none", "project", "user"].sort());
});

test("availableScopeOptions：前面選過 none → 不限制", () => {
  const options = availableScopeOptions(["none"]);
  expect(options.map((o) => o.value).sort()).toEqual(["local", "none", "project", "user"].sort());
});

test("scopeStepDefault：preferred 仍在選項內時原樣回傳", () => {
  const options = availableScopeOptions(["project"]);
  expect(scopeStepDefault(options, "user")).toBe("user");
});

test("scopeStepDefault：preferred 已被排除時回退成選項第一個（避免 Select defaultValue 對不到任何選項）", () => {
  const options = availableScopeOptions(["local"]);
  expect(scopeStepDefault(options, "user")).not.toBe("user");
  expect(options.some((o) => o.value === scopeStepDefault(options, "user"))).toBe(true);
});
