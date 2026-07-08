import { expect, test } from "bun:test";
import { parse } from "yaml";

test("toolchain works", () => {
  expect(parse("a: 1")).toEqual({ a: 1 });
});
