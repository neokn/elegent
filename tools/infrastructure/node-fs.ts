import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { FileStore } from "@core/ports";

/** FileStore 的 node:fs 實作（唯一實作）。infrastructure → core 只依賴 port 型別，合乎依賴方向。 */
export const nodeFileStore: FileStore = {
  read: (p) => readFileSync(p, "utf8"),
  tryRead: (p) => {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return null;
    }
  },
  write: (p, content) => {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  },
  mkdirp: (p) => mkdirSync(p, { recursive: true }),
  exists: (p) => existsSync(p),
  lexists: (p) => {
    try {
      lstatSync(p);
      return true;
    } catch {
      return false;
    }
  },
  entries: (dir) => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).map((e) => ({
      name: e.name,
      isDir: e.isDirectory(),
      isFile: e.isFile(),
    }));
  },
  walkFiles: (dir, ext) => {
    const out: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.isFile() && e.name.endsWith(ext)) out.push(full);
      }
    };
    if (existsSync(dir)) walk(dir);
    return out;
  },
  symlink: (target, linkPath) => symlinkSync(target, linkPath),
  mtimeMs: (p) => {
    try {
      return statSync(p).mtimeMs;
    } catch {
      return null;
    }
  },
  realpath: (p) => realpathSync(p),
};
