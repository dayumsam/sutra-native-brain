import { sql } from "drizzle-orm";
import { getSpine, spineDisabledResponse } from "../../../../lib/spine";

export const dynamic = "force-dynamic";

export async function GET() {
  const spinePromise = getSpine();
  if (!spinePromise) return spineDisabledResponse();
  const spine = await spinePromise;

  const insights = await spine.db.execute(sql`
    SELECT i.id, i.status, i.content, i.created_at,
           s.trigger_key, s.severity, s.payload AS signal_payload,
           r.trace_id, r.subgraph_snapshot
    FROM insights i
    JOIN signals s ON s.id = i.signal_id
    LEFT JOIN agent_runs r ON r.id = i.agent_run_id
    WHERE i.tenant_id = ${spine.tenantId}
    ORDER BY i.created_at DESC
    LIMIT 50
  `);
  return Response.json({ insights: insights.rows });
}
