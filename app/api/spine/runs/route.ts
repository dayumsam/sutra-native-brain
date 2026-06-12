import { sql } from "drizzle-orm";
import { getSpine, spineDisabledResponse } from "../../../../lib/spine";

export const dynamic = "force-dynamic";

export async function GET() {
  const spinePromise = getSpine();
  if (!spinePromise) return spineDisabledResponse();
  const spine = await spinePromise;

  const runs = await spine.db.execute(sql`
    SELECT r.id, r.status, r.steps, r.trace_id, r.tokens_in, r.tokens_out,
           r.error, r.created_at, r.updated_at, r.subgraph_snapshot,
           s.trigger_key, s.severity, s.payload AS signal_payload
    FROM agent_runs r
    JOIN signals s ON s.id = r.signal_id
    WHERE r.tenant_id = ${spine.tenantId}
    ORDER BY r.created_at DESC
    LIMIT 100
  `);
  return Response.json({ runs: runs.rows });
}
