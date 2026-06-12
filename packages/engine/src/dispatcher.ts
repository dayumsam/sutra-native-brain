import { sql } from "drizzle-orm";
import { getLogger, withSpan, type EventBus } from "@sutra/contracts";
import type { OntologyRegistry } from "@sutra/ontology-core";
import type { Db, GraphStore } from "@sutra/graph";
import { normalizeEvents, type NormalizeStats } from "@sutra/ingestion";
import { runEventTriggers, runSqlTriggers } from "./detectors";
import { getOrCreateSessionId } from "./session";
import { insertSignals } from "./signals";

const log = getLogger("engine.dispatcher");

export type EngineDeps = {
  db: Db;
  store: GraphStore;
  bus: EventBus;
  registry: OntologyRegistry;
};

export type TickResult = {
  processed: number;
  normalize: NormalizeStats | null;
  newSignalIds: string[];
  newAgentRunIds: string[];
};

const BATCH_SIZE = 500;

// One dispatcher tick: consume → normalize → detect → enqueue agent runs.
// Idempotent and cheap when there is nothing to do.
export async function tick(deps: EngineDeps): Promise<TickResult> {
  // Phase 1 is single-tenant; the tick trace joins that tenant's session.
  const firstTenant = deps.registry.tenantIds()[0];
  const sessionId = firstTenant ? await getOrCreateSessionId(deps.db, firstTenant) : undefined;
  return withSpan("engine.tick", sessionId ? { "langfuse.session.id": sessionId } : {}, async (setAttributes) => {
    const events = await deps.bus.consume(BATCH_SIZE);
    const result: TickResult = {
      processed: events.length,
      normalize: null,
      newSignalIds: [],
      newAgentRunIds: [],
    };

    if (events.length > 0) {
      result.normalize = await normalizeEvents(deps.registry, deps.store, events);
    }

    for (const tenantId of deps.registry.tenantIds()) {
      const ctx = { tenantId };
      const ontology = deps.registry.get(tenantId);
      const detections = [
        ...(await runEventTriggers(deps.store, ctx, ontology, events)),
        ...(await runSqlTriggers(deps.db, ctx, ontology)),
      ];
      const signalIds = await insertSignals(deps.db, ctx, detections);
      result.newSignalIds.push(...signalIds);

      for (const signalId of signalIds) {
        const run = await deps.db.execute(sql`
          INSERT INTO agent_runs (tenant_id, signal_id, status)
          VALUES (${tenantId}, ${signalId}, 'pending')
          RETURNING id
        `);
        result.newAgentRunIds.push((run.rows[0] as { id: string }).id);
      }
    }

    if (events.length > 0) {
      await deps.bus.markProcessed(events.map((e) => e.id));
    }

    setAttributes({
      "tick.processed": result.processed,
      "tick.signals": result.newSignalIds.length,
    });
    if (result.processed > 0 || result.newSignalIds.length > 0) {
      log.info(
        { processed: result.processed, signals: result.newSignalIds.length },
        "tick complete",
      );
    }
    return result;
  });
}
