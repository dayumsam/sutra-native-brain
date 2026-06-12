import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { SQL } from "drizzle-orm";

// Structural database handle satisfied by both drizzle drivers we use:
// node-postgres (Neon, in the app) and PGlite (tests). Raw SQL is all the
// spine needs; rows come back as plain objects.
export type QueryRows = { rows: Array<Record<string, unknown>> };

export type Db = {
  execute(query: SQL): Promise<QueryRows>;
};

let pool: Pool | undefined;

export function createDb(connectionString = process.env.DATABASE_URL): Db {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — spine storage is unavailable");
  }
  pool ??= new Pool({ connectionString, max: 5 });
  return drizzle(pool) as unknown as Db;
}
