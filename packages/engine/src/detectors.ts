import { sql } from "drizzle-orm";
import { getLogger, withSpan, type StoredEvent, type TenantContext } from "@sutra/contracts";
import type { Detection, Ontology, TriggerDef } from "@sutra/ontology-core";
import type { Db, GraphStore } from "@sutra/graph";

const log = getLogger("engine.detect");

export type TriggerDetection = { trigger: TriggerDef; detection: Detection };

/** Event triggers: rules over the just-consumed batch of change events. */
export async function runEventTriggers(
  store: GraphStore,
  ctx: TenantContext,
  ontology: Ontology,
  events: StoredEvent[],
): Promise<TriggerDetection[]> {
  const detections: TriggerDetection[] = [];
  for (const trigger of ontology.triggerDefs()) {
    if (trigger.kind !== "event" || !trigger.match) continue;
    await withSpan(
      `detect.${trigger.key}`,
      { "tenant.id": ctx.tenantId, "trigger.kind": trigger.kind, "events.count": events.length },
      async (setAttributes) => {
        let hits = 0;
        for (const event of events) {
          if (event.tenant_id !== ctx.tenantId) continue;
          const match = trigger.match!(event);
          if (!match) continue;
          let entityId: string | null = null;
          if (match.entityRef) {
            const entity = await store.getEntityByRef(ctx, match.entityRef);
            entityId = entity?.id ?? null;
            if (!entity) {
              log.warn(
                { trigger: trigger.key, ref: match.entityRef },
                "event trigger matched but entity is unresolved",
              );
            }
          }
          detections.push({
            trigger,
            detection: { entity_id: entityId, payload: match.payload },
          });
          hits++;
        }
        setAttributes({ "detect.hits": hits });
      },
    );
  }
  return detections;
}

/** Threshold and graph-pattern triggers: SQL over the canonical store. */
export async function runSqlTriggers(
  db: Db,
  ctx: TenantContext,
  ontology: Ontology,
): Promise<TriggerDetection[]> {
  const detections: TriggerDetection[] = [];
  // Tenant ids are registry-controlled identifiers; quote defensively anyway.
  const tenantLiteral = `'${ctx.tenantId.replace(/[^a-zA-Z0-9_-]/g, "")}'`;
  for (const trigger of ontology.triggerDefs()) {
    if (trigger.kind === "event" || !trigger.sql) continue;
    await withSpan(
      `detect.${trigger.key}`,
      { "tenant.id": ctx.tenantId, "trigger.kind": trigger.kind },
      async (setAttributes) => {
        const result = await db.execute(sql.raw(trigger.sql!.replaceAll("$1", tenantLiteral)));
        for (const row of result.rows) {
          const r = row as { entity_id: string | null; payload: Record<string, unknown> };
          detections.push({
            trigger,
            detection: { entity_id: r.entity_id, payload: r.payload },
          });
        }
        setAttributes({ "detect.hits": result.rows.length });
      },
    );
  }
  return detections;
}
