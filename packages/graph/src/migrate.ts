import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import { getLogger } from "@sutra/contracts";
import type { Db } from "./db";

const log = getLogger("graph.migrate");
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

// Minimal forward-only migrator shared by tests (PGlite) and ops (Neon).
// Files run in lexicographic order; statements split on drizzle's marker.
export async function migrate(db: Db): Promise<void> {
  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
    )`),
  );
  const applied = new Set(
    (await db.execute(sql.raw(`SELECT name FROM schema_migrations`))).rows.map(
      (r) => (r as { name: string }).name,
    ),
  );
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of body.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.execute(sql.raw(statement));
    }
    await db.execute(
      sql`INSERT INTO schema_migrations (name) VALUES (${file})`,
    );
    log.info({ file }, "applied migration");
  }
}
