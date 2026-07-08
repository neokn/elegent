import { expect, test, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderTemplate, renderCodexMcpToml, DEV_ELEGENT_BIN, type TemplateName } from "@core/application/templates";

const VARS = { ELEGENT_BIN: "./elgt" };
const REPO_ROOT = resolve(import.meta.dir, "../../..");

const ALL_NAMES: TemplateName[] = ["skill-digest", "gitignore"];

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

test("renderCodexMcpToml：ELEGENT_BIN 實際被替換進輸出（而非模板本來就沒有佔位符）", () => {
  const out = renderCodexMcpToml("./elgt", "/v");
  expect(out).toContain("./elgt");
});

describe("skill-digest 模板", () => {
  test("含寫入契約關鍵句（防模板漂移）：淨新增、Citations、valid_to", () => {
    const out = renderTemplate("skill-digest", VARS);
    expect(out).toContain("淨新增");
    expect(out).toContain("Citations");
    expect(out).toContain("valid_to");
  });

  test("guard/reindex/lint 指令自足、內嵌格式鐵律、不再引用 CLAUDE.md/AGENTS.md", () => {
    const out = renderTemplate("skill-digest", VARS);
    expect(out).toContain("elgt guard <該檔路徑>");
    expect(out).toContain("elgt reindex");
    expect(out).toContain("elgt lint");
    // 自足：不再把規範外包給 CLAUDE.md/AGENTS.md
    expect(out).not.toContain("CLAUDE.md");
    expect(out).not.toContain("AGENTS.md");
    // 內嵌格式鐵律（從舊 claude-md 搬入）
    expect(out).toContain("note|moc|entity|raw-log|wake|daily");
    expect(out).toContain("## Facts");
  });
});

describe("gitignore 模板", () => {
  test("包含 .elegent-state/ 與 .DS_Store", () => {
    const out = renderTemplate("gitignore", VARS);
    expect(out).toContain(".elegent-state/");
    expect(out).toContain(".DS_Store");
  });
});

describe("renderCodexMcpToml", () => {
  test("單段 bin：command 原樣、args 只有 mcp", () => {
    const out = renderCodexMcpToml("/bin/elgt", "/v");
    expect(out).toContain('command = "/bin/elgt"');
    expect(out).toContain('args = ["mcp"]');
    expect(out).toContain('ELEGENT_VAULT = "/v"');
    expect(out).not.toContain("{{");
  });
  test("兩段 bin：command=bun、args 前面接上 elgt.ts 路徑", () => {
    const out = renderCodexMcpToml("bun /abs/elgt.ts", "/v");
    expect(out).toContain('command = "bun"');
    expect(out).toContain('args = ["/abs/elgt.ts", "mcp"]');
  });

  test("vaultRoot 含特殊替換序列（$&、$`）時逐字保留，不被當成 replaceAll 語法解析", () => {
    const weird = "/Users/me/build$&out/$`vault";
    const out = renderCodexMcpToml("/bin/elgt", weird);
    expect(out).toContain(`ELEGENT_VAULT = "${weird}"`);
  });

  test("vaultRoot 含雙引號/反斜線時跳脫成合法 TOML 字串", () => {
    const out = renderCodexMcpToml("/bin/elgt", '/tmp/"weird"\\path');
    expect(out).toContain('ELEGENT_VAULT = "/tmp/\\"weird\\"\\\\path"');
  });
});

describe("防漂移：.claude/skills/digest/SKILL.md（開發時手改的那份）與 src/assets/skill-digest.md（ship 給使用者的模板）必須渲染一致（見 scripts/extract-templates.ts）", () => {
  test(".claude/skills/digest/SKILL.md 與 renderTemplate(\"skill-digest\", { ELEGENT_BIN: DEV_ELEGENT_BIN }) 逐字相同", () => {
    const expected = renderTemplate("skill-digest", { ELEGENT_BIN: DEV_ELEGENT_BIN });
    const actual = readFileSync(resolve(REPO_ROOT, ".claude/skills/digest/SKILL.md"), "utf8");
    expect(actual).toBe(expected);
  });
});
