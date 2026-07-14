import { join } from "node:path";
import { serializeNote } from "@core/domain/frontmatter";
import { localDateISO } from "@core/domain/dates";
import type { FileStore } from "@core/ports";

const TODAY = localDateISO();

function note(type: string, title: string, description: string, body: string, extra: Record<string, unknown> = {}): string {
  return serializeNote({ type, title, description, date: TODAY, ...extra }, body);
}

const FILES: Record<string, string> = {
  "index.md": `---\nokf_version: "0.1"\n---\n\n# Subdirectories\n\n* [projects](projects/index.md) - 進行中的專案\n* [areas](areas/index.md) - 持續責任\n* [resources](resources/index.md) - 知識主題\n* [archives](archives/index.md) - 已完結\n* [pensieve](pensieve/index.md) - 儲思盆\n`,
  "pensieve/wake/identity.md": note("wake", "Identity", "我是誰、關鍵的人、原則（L0，常駐注入）。", "# Identity\n\n（請手動填寫：你是誰、關鍵的人、互動原則。此檔 LLM 只讀。）\n", { user_managed: true }),
  "pensieve/wake/essential-story.md": note("wake", "Essential Story", "現在什麼最重要（L1，常駐注入，由蒸餾流程重編譯）。", "# Essential Story\n\n（由 /distil 依 PARA 活躍專案重編譯；≤15 條、≤3200 字元。）\n", { user_managed: false }),
  "pensieve/map.md": note("moc", "Pensieve Map", "closet pointer 式壓縮索引，LLM 掃描用。", "# Pensieve Map\n\n> 格式：每行一指標 `- 主題短語 | 實體;實體 | YYYY-MM-DD | →[標題](相對路徑.md)`。\n> 行 ≤120 字元；本檔分片 ≤1500 字元。\n> 由 /distil 追加；miss 時 fallback 全文 grep。\n> 指標指向 ankipan 檔或 wiki 頁的錨點。\n"),
  "pensieve/log.md": `# Log\n\n## ${TODAY}\n\n* **Creation**: vault 初始化。\n`,
  ".obsidian/app.json": JSON.stringify({ useMarkdownLinks: true, newLinkFormat: "relative", alwaysUpdateLinks: true }, null, 2) + "\n",
};

const DIRS = [
  "projects", "areas", "resources", "archives",
  "pensieve/wake", "pensieve/entities",
  "pensieve/ankipan/conversations", "pensieve/ankipan/clippings", "pensieve/ankipan/journal",
];

export function scaffoldVault(store: FileStore, vaultRoot: string): string[] {
  const created: string[] = [];
  for (const d of DIRS) store.mkdirp(join(vaultRoot, d));
  for (const [rel, content] of Object.entries(FILES)) {
    const p = join(vaultRoot, rel);
    if (store.exists(p)) continue;
    store.write(p, content);
    created.push(p);
  }
  return created;
}
