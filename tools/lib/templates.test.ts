import { expect, test, describe } from "bun:test";
import { renderTemplate, type TemplateName } from "./templates";

const VARS = { ELEGENT_BIN: "./elgt" };

const ALL_NAMES: TemplateName[] = ["skill-digest", "claude-md", "settings-json", "mcp-json", "gitignore"];

describe("renderTemplate：通用防漂移檢查（每個模板）", () => {
  for (const name of ALL_NAMES) {
    test(`${name}：render 後無 {{ 殘留、無 bun tools、無 bun run`, () => {
      const out = renderTemplate(name, VARS);
      expect(out).not.toContain("{{");
      expect(out).not.toContain("bun tools");
      expect(out).not.toContain("bun run");
    });
  }
});

test("renderTemplate：ELEGENT_BIN 實際被替換進輸出（而非模板本來就沒有佔位符）", () => {
  const out = renderTemplate("claude-md", VARS);
  expect(out).toContain("./elgt reindex");
});

describe("skill-digest 模板", () => {
  test("含寫入契約關鍵句（防模板漂移）：淨新增、Citations、valid_to", () => {
    const out = renderTemplate("skill-digest", VARS);
    expect(out).toContain("淨新增");
    expect(out).toContain("Citations");
    expect(out).toContain("valid_to");
  });

  test("guard/reindex/lint 指令已替換為 ELEGENT_BIN 形式", () => {
    const out = renderTemplate("skill-digest", VARS);
    expect(out).toContain("./elgt guard <該檔路徑>");
    expect(out).toContain("./elgt reindex");
    expect(out).toContain("./elgt lint");
  });
});

describe("claude-md 模板", () => {
  test("工具節指令已替換為 ELEGENT_BIN 形式", () => {
    const out = renderTemplate("claude-md", VARS);
    expect(out).toContain("./elgt lint");
    expect(out).toContain("./elgt reindex");
    expect(out).toContain("./elgt backfill");
    expect(out).toContain("./elgt guard <file>");
  });
});

describe("settings-json 模板", () => {
  test("JSON.parse 得過，四個 hooks 齊全，permissions.allow 含替換後路徑", () => {
    const out = renderTemplate("settings-json", VARS);
    const parsed = JSON.parse(out);
    expect(Object.keys(parsed.hooks).sort()).toEqual(
      ["PreCompact", "SessionEnd", "SessionStart", "Stop"].sort(),
    );
    for (const name of ["Stop", "PreCompact", "SessionEnd", "SessionStart"]) {
      const cmd = parsed.hooks[name][0].hooks[0].command;
      expect(cmd).toContain("./elgt hook");
    }
    expect(parsed.permissions.allow).toContain("Bash(./elgt:*)");
  });
});

describe("mcp-json 模板", () => {
  test("JSON.parse 得過，command/args 已替換", () => {
    const out = renderTemplate("mcp-json", VARS);
    const parsed = JSON.parse(out);
    expect(parsed.mcpServers["elegent-memory"].command).toBe("./elgt");
    expect(parsed.mcpServers["elegent-memory"].args).toEqual(["mcp"]);
  });
});

describe("gitignore 模板", () => {
  test("包含 .elegent-state/ 與 .DS_Store", () => {
    const out = renderTemplate("gitignore", VARS);
    expect(out).toContain(".elegent-state/");
    expect(out).toContain(".DS_Store");
  });
});
