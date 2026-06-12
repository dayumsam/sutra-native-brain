import { sql } from "drizzle-orm";
import type { Db } from "@sutra/graph";

// One observability session per simulation epoch per tenant. Stored in meta,
// so a database reset (which truncates meta) starts a fresh session — in
// Langfuse, every tick and agent run of one replay groups under one session
// via the `langfuse.session.id` span attribute.
export async function getOrCreateSessionId(db: Db, tenantId: string): Promise<string> {
  const existing = await db.execute(sql`
    SELECT v FROM meta WHERE tenant_id = ${tenantId} AND k = 'session_id'
  `);
  const row = existing.rows[0] as { v: string } | undefined;
  if (row) return String(row.v);

  const sessionId = `sim:${tenantId}:${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  await db.execute(sql`
    INSERT INTO meta (tenant_id, k, v)
    VALUES (${tenantId}, 'session_id', ${JSON.stringify(sessionId)}::jsonb)
    ON CONFLICT (tenant_id, k) DO NOTHING
  `);
  const final = await db.execute(sql`
    SELECT v FROM meta WHERE tenant_id = ${tenantId} AND k = 'session_id'
  `);
  return String((final.rows[0] as { v: string }).v);
}
