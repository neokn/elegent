import { join } from "node:path";
import { regenerateIndexes } from "../lib/indexgen";

const written = regenerateIndexes(process.argv[2] ?? join(process.cwd(), "vault"));
console.log(`重生 ${written.length} 份 index.md`);
