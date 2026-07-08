import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, relative, sep } from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildWakeBundle } from "@core/application/wake";
import { slugify } from "@core/domain/safety";
import { nodeFileStore } from "@infrastructure/adapters/node-fs";
import { VERSION } from "@core/version";

/**
 * MCP serverInfo：與 src/core/version.ts 的 VERSION 同步，避免 initialize response
 * 回報的版本跟 `elgt version` 印出的不一致（單一版本真理來源）。獨立匯出方便測試
 * 直接斷言 `SERVER_INFO.version === VERSION`，不必啟動 stdio transport。
 */
export const SERVER_INFO = { name: "elegent-memory", version: VERSION };

/**
 * MCP initialize handshake 的 instructions：餵給模型的 vault 定位 + 檢索 SOP，
 * 讓「我記得…嗎」這類查詢知道該用哪些 tool、依什麼順序查、查到後怎麼處理。
 */
export const VAULT_INSTRUCTIONS = `這是 EleGent 個人記憶 vault（雙受眾 markdown）。projects/areas/resources/archives = PARA（給人）；palace/ = 記憶宮殿（給 LLM）。可能同時掛載多個 vault（全域 + 專案），搜尋結果會以 [vault] 前綴標註來源。

查詢「我記得…嗎」SOP：
1. 先 memory_wake 拿 identity + 當前要事；或 memory_read \`palace/map.md\` 定位。
2. memory_search 多路查詢：原句 + 同義詞 + 上位概念（查一次不夠）。
3. 只 memory_read 命中的檔；需要證據追到 palace/raw/ 逐字紀錄。
4. 有價值的綜合值得回填——請使用者觸發 /digest 依寫入契約寫回 PARA。

不要自己改檔：寫入一律走 /digest skill。index.md 是生成物（elgt reindex），別手改。`;

const DEFAULT_SEARCH_LIMIT = 20;
const SEARCH_LIMIT_MAX = 200;

/** memory_search 的 limit 參數 schema：拒絕 0／負數／非整數／超過上限，避免呼叫端傳入不合理值。 */
export const searchLimitSchema = z.number().int().min(1).max(SEARCH_LIMIT_MAX).optional();

/**
 * 把 rel 解析到 vaultRoot 之下，並確認結果沒有逃出 vaultRoot。
 * 兩層檢查（皆用 root + sep 前綴，防 `vault-evil` 同前綴 sibling 假陽性放行）：
 * 1. 字串比對：擋 `../` 相對逃逸與 vault 外絕對路徑。
 * 2. realpath 比對：擋 vault 內 symlink 指向 vault 外（字串比對看不見 symlink）。
 *    target 尚不存在時退回「父目錄 realpath + basename」驗證；root 也 realpath 化
 *    （macOS 的 /tmp、/var 本身就是 /private/* 的 symlink，否則合法路徑會被誤擋）。
 * 逃逸一律 throw；回傳 realpath 化的目標路徑。
 */
function resolveInVault(vaultRoot: string, rel: string): string {
  const root = resolve(vaultRoot);
  const target = resolve(root, rel);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`路徑逃出 vault: ${rel}`);
  }
  const realRoot = realpathSync(root);
  let realTarget: string;
  try {
    realTarget = realpathSync(target);
  } catch {
    realTarget = join(realpathSync(dirname(target)), basename(target));
  }
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) {
    throw new Error(`路徑逃出 vault: ${rel}`);
  }
  return realTarget;
}

/** 列出 vaultRoot/rel 目錄一層內容；目錄名以 "/" 結尾標記，忽略隱藏檔（. 開頭）。 */
export function listDir(vaultRoot: string, rel: string): string[] {
  const dir = resolveInVault(vaultRoot, rel);
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
}

/** 對 vaultRoot 下所有 .md 檔逐行大小寫不敏感搜尋，回傳 "相對路徑:行號: 片段"，上限 limit。 */
export function searchVault(vaultRoot: string, query: string, limit: number = DEFAULT_SEARCH_LIMIT): string[] {
  const root = resolve(vaultRoot);
  const needle = query.toLowerCase();
  const hits: string[] = [];

  function walk(dir: string): void {
    if (hits.length >= limit) return;
    const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith("."));
    for (const entry of entries) {
      if (hits.length >= limit) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const lines = readFileSync(full, "utf8").split("\n");
        for (let i = 0; i < lines.length && hits.length < limit; i++) {
          if (lines[i].toLowerCase().includes(needle)) {
            hits.push(`${relative(root, full)}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      }
    }
  }

  walk(root);
  return hits;
}

/** 讀單檔全文；rel 解析後必須落在 vaultRoot 之內，否則 throw（防逃逸）。 */
export function readNote(vaultRoot: string, rel: string): string {
  const target = resolveInVault(vaultRoot, rel);
  return readFileSync(target, "utf8");
}

/** 解析所有要服務的 vault root：主 ELEGENT_VAULT + 專案下的嵌入 vault，realpath 去重。 */
export function resolveVaultRoots(env: { ELEGENT_VAULT?: string; CLAUDE_PROJECT_DIR?: string }, cwd: string): string[] {
  const roots: string[] = [env.ELEGENT_VAULT ?? join(cwd, "vault")];
  const projectDir = env.CLAUDE_PROJECT_DIR ?? cwd;
  const base = slugify(basename(projectDir));
  if (base) {
    for (const name of [`.${base}.vault`, `${base}.vault`]) {
      const p = join(projectDir, name);
      if (existsSync(p)) roots.push(p);
    }
  }
  const seen = new Set<string>();
  return roots.filter((root) => {
    let key: string;
    try {
      key = realpathSync(root);
    } catch {
      key = resolve(root);
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 跨多個 vault root 搜尋，結果以 root basename 標籤前綴。 */
export function searchVaults(roots: string[], query: string, limit: number): string[] {
  const out: string[] = [];
  for (const root of roots) {
    if (out.length >= limit) break;
    const tag = basename(root);
    for (const hit of searchVault(root, query, limit - out.length)) {
      out.push(`[${tag}] ${hit}`);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function readFromVaults(roots: string[], path: string): string {
  let lastErr: unknown;
  for (const root of roots) {
    try {
      return readNote(root, path);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`讀取失敗: ${path}`);
}

/**
 * MCP 接線：建立 McpServer、註冊四個 tool、接上 stdio transport。
 * 只在直接執行本檔（`bun src/mcp/server.ts`）或透過 `elgt mcp` 呼叫時才會被叫用；
 * 被測試 import 純函式時不會啟動 server（否則 stdio transport 會嘗試接管 stdin，讓 bun test 卡住）。
 */
export async function startServer(): Promise<void> {
  const roots = resolveVaultRoots(process.env, process.cwd());

  const server = new McpServer(SERVER_INFO, { instructions: VAULT_INSTRUCTIONS });

  server.registerTool(
    "memory_list",
    {
      title: "List vault directory",
      description: "列 vault 目錄樹一層（name、type），dir 省略時列 vault 根目錄",
      inputSchema: { dir: z.string().optional() },
    },
    ({ dir }) => {
      const entries = listDir(roots[0], dir ?? "");
      return { content: [{ type: "text" as const, text: entries.join("\n") }] };
    },
  );

  server.registerTool(
    "memory_search",
    {
      title: "Search vault",
      description: "對 vault .md 逐行大小寫不敏感搜尋，回傳 file:line: snippet（上限 limit，預設 20）",
      inputSchema: { query: z.string(), limit: searchLimitSchema },
    },
    ({ query, limit }) => {
      const hits = searchVaults(roots, query, limit ?? DEFAULT_SEARCH_LIMIT);
      return { content: [{ type: "text" as const, text: hits.join("\n") }] };
    },
  );

  server.registerTool(
    "memory_read",
    {
      title: "Read note",
      description: "讀單檔全文（路徑須在 vault 內）",
      inputSchema: { path: z.string() },
    },
    ({ path }) => {
      const text = readFromVaults(roots, path);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.registerTool(
    "memory_wake",
    {
      title: "Wake bundle",
      description: "回傳 wake bundle 文字（identity + essential-story）",
    },
    () => {
      const bundle = buildWakeBundle(nodeFileStore, roots[0]);
      return { content: [{ type: "text" as const, text: bundle.text }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.main) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
