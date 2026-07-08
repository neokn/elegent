/**
 * Core 對外部世界的 port（介面）。core 只依賴這些型別、由 presentation 在組裝根注入 infrastructure 的實作，
 * 因此 core 完全不 import `node:fs`／`Bun.spawn`——`tools/architecture.test.ts` 用測試強制。
 *
 * 設計取捨：`FileStore` 刻意是「薄的檔案系統抽象」而非完全 domain-shaped 的
 * `VaultStore.writeNote()`。理由（依 explicit-architecture 的「tune the degree of decoupling
 * to the system」原則）：EleGent 被驅動的工具「就是檔案系統本身」，永遠不會抽換成別的 backend；
 * 且 `indexgen`／`lint`／codex session 探測本質是「檔案樹走訪」，強行 domain 化只是把 fs API
 * 換個名字再包一層。因此取實用的薄 port，換得 core 的可測性（可注入 in-memory FileStore 做
 * 無磁碟單元測試）與「不碰具體 I/O」的乾淨依賴方向。infrastructure/ 下各有唯一的 node 實作。
 */

export interface FileStore {
  /** 讀檔（UTF-8）；不存在會 throw（呼叫端已知檔在時用）。 */
  read(path: string): string;
  /** 讀檔；不存在／讀不到回 null。 */
  tryRead(path: string): string | null;
  /** 寫檔，自動建父目錄。 */
  write(path: string, content: string): void;
  /** 建立目錄（含父層）；用於需要空目錄存在的情形（如 vault 骨架的空 PARA 目錄）。 */
  mkdirp(path: string): void;
  /** 路徑是否存在（跟隨符號連結）。 */
  exists(path: string): boolean;
  /** 路徑是否存在（不跟隨連結；壞掉的 symlink 也算存在）。 */
  lexists(path: string): boolean;
  /** 列出單層目錄項（name + 類型）；不存在回空陣列。 */
  entries(dir: string): Array<{ name: string; isDir: boolean; isFile: boolean }>;
  /** 遞迴列出副檔名為 ext（含點，如 ".md"）的檔，回絕對路徑；不存在回空陣列。 */
  walkFiles(dir: string, ext: string): string[];
  /** 建立符號連結（target 為連結指向的內容，linkPath 為連結本身）。 */
  symlink(target: string, linkPath: string): void;
  /** 檔案 mtime（毫秒）；不存在回 null。 */
  mtimeMs(path: string): number | null;
  /** 解析真實路徑（跟隨連結）；失敗回原路徑的 resolve 結果由呼叫端決定，這裡直接 throw。 */
  realpath(path: string): string;
}

/**
 * Core 需要的 git 動作（shaped to Core's needs，不是通用 spawn）。`detail` 於失敗時帶
 * stderr／`exit N`，供呼叫端組警告訊息；`ok` 為是否成功。實作在 infrastructure（Bun.spawn）。
 */
export interface GitRunner {
  init(dir: string): { ok: boolean; detail: string };
  stageAll(dir: string): { ok: boolean; detail: string };
  commit(dir: string, message: string): { ok: boolean; detail: string };
  diffNameStatus(cwd: string, path: string): { ok: boolean; lines: string; detail: string };
}

/**
 * 依 hook 輸入 + cwd 找出該歸檔的 Codex rollout 檔。實作內含 `~/.codex/sessions` 的磁碟佈局知識
 * 與檔案系統走訪——那是外部工具的持久化細節，屬 infrastructure；Core 只依賴這個介面。
 */
export interface CodexSessionLocator {
  locate(hookInput: unknown, cwd: string): { path: string; sessionId: string | null } | null;
}
