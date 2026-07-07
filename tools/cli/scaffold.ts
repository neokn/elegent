import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { serializeNote } from "../lib/frontmatter";
import { localDateISO } from "../lib/dates";

const TODAY = localDateISO();

function note(type: string, title: string, description: string, body: string, extra: Record<string, unknown> = {}): string {
  return serializeNote({ type, title, description, date: TODAY, ...extra }, body);
}

const FILES: Record<string, string> = {
  "index.md": `---\nokf_version: "0.1"\n---\n\n# Subdirectories\n\n* [projects](projects/index.md) - 進行中的專案\n* [areas](areas/index.md) - 持續責任\n* [resources](resources/index.md) - 知識主題\n* [archives](archives/index.md) - 已完結\n* [palace](palace/index.md) - 記憶宮殿\n`,
  "palace/wake/identity.md": note("wake", "Identity", "我是誰、關鍵的人、原則（L0，常駐注入）。", "# Identity\n\n（請手動填寫：你是誰、關鍵的人、互動原則。此檔 LLM 只讀。）\n", { user_managed: true }),
  "palace/wake/essential-story.md": note("wake", "Essential Story", "現在什麼最重要（L1，常駐注入，由蒸餾流程重編譯）。", "# Essential Story\n\n（由 /digest 依 PARA 活躍專案重編譯；≤15 條、≤3200 字元。）\n", { user_managed: false }),
  "palace/map.md": note("moc", "Palace Map", "closet pointer 式壓縮索引，LLM 掃描用。", "# Palace Map\n\n> 格式：每行一指標 `- 主題短語 | 實體;實體 | YYYY-MM-DD | →[標題](相對路徑.md)`。\n> 行 ≤120 字元；本檔分片 ≤1500 字元。\n> 由 /digest 追加；miss 時 fallback 全文 grep。\n> 指標指向 raw 檔或 wiki 頁的錨點。\n"),
  "palace/log.md": `# Log\n\n## ${TODAY}\n\n* **Creation**: vault 初始化。\n`,
  ".obsidian/app.json": JSON.stringify({ useMarkdownLinks: true, newLinkFormat: "relative", alwaysUpdateLinks: true }, null, 2) + "\n",
};

const DIRS = [
  "projects", "areas", "resources", "archives",
  "palace/wake", "palace/entities",
  "palace/raw/conversations", "palace/raw/clippings", "palace/raw/journal",
];

export function scaffoldVault(vaultRoot: string): string[] {
  const created: string[] = [];
  for (const d of DIRS) mkdirSync(join(vaultRoot, d), { recursive: true });
  for (const [rel, content] of Object.entries(FILES)) {
    const p = join(vaultRoot, rel);
    if (existsSync(p)) continue;
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
    created.push(p);
  }
  return created;
}

/** `bun tools/cli/scaffold.ts` 的入口邏輯；argv[0] 為選填的 vault 路徑（尚未接上 elgt 路由——task 25 的 bootstrap 直接呼叫 scaffoldVault）。 */
export async function runScaffoldEntry(argv: string[] = []): Promise<number> {
  const root = argv[0] ?? join(process.cwd(), "vault");
  const created = scaffoldVault(root);
  console.log(created.length ? `建立 ${created.length} 個檔案` : "骨架已存在，未變更");
  return 0;
}

if (import.meta.main) {
  process.exit(await runScaffoldEntry(process.argv.slice(2)));
}
