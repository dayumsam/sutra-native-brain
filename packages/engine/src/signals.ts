import { sql } from "drizzle-orm";
import { getLogger, type TenantContext } from "@sutra/contracts";
import type { Db } from "@sutra/graph";
import type { TriggerDetection } from "./detectors";

const log = getLogger("engine.signals");

// Deduplicated, structured output of the detect stage. The unique dedupe_key
// makes repeated detections of the same condition (every tick re-runs the
// SQL triggers) a no-op: 50 tickets on one batch is one signal, not 50.
export async function insertSignals(
  db: Db,
  ctx: TenantContext,
  detections: TriggerDetection[],
): Promise<string[]> {
  const created: string[] = [];
  for (const { trigger, detection } of detections) {
    const dedupeKey = trigger.dedupeKey(detection);
    const result = await db.execute(sql`
      INSERT INTO signals (tenant_id, trigger_key, entity_id, severity, payload, dedupe_key)
      VALUES (${ctx.tenantId}, ${trigger.key}, ${detection.entity_id},
              ${trigger.severity}, ${JSON.stringify(detection.payload)}::jsonb, ${dedupeKey})
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING id
    `);
    const id = (result.rows[0] as { id: string } | undefined)?.id;
    if (id) {
      created.push(id);
      log.info({ signal_id: id, trigger: trigger.key, dedupe_key: dedupeKey }, "signal created");
    } else {
      log.debug({ trigger: trigger.key, dedupe_key: dedupeKey }, "signal deduplicated");
    }
  }
  return created;
}
