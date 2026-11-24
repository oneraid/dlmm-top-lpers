// Minimal .env loader (no new dependency) — import FIRST in entry points
// (run-job.ts, index.ts) so DATABASE_URL / REDIS_URL are set before the
// Prisma client is constructed at import time.
//
// Why: `npm run job:*` runs with cwd=workers/, and Prisma only reads
// process.env — the repo-root .env was silently ignored, so every job
// failed with "Environment variable not found: DATABASE_URL" unless the
// caller sourced .env by hand. Existing shell env always wins.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootEnv = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".env",
);

try {
  const text = fs.readFileSync(rootEnv, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
} catch {
  // No root .env — fall back to whatever the shell already provides.
}
