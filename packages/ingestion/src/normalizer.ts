import { getLogger, withSpan, type StoredEvent } from "@sutra/contracts";
import type { OntologyRegistry } from "@sutra/ontology-core";
import type { GraphStore } from "@sutra/graph";

const log = getLogger("ingest.normalize");

export type NormalizeStats = {
  entities: number;
  edges: number;
  documents: number;
  skipped: number;
  errors: Array<{ event_id: string; error: string }>;
};

// Raw change events → canonical writes, via the tenant ontology's source
// mappings. Resolution is deterministic only: declared keys, no fuzzy
// matching, no LLM (spec: never let the LLM resolve entities).
export async function normalizeEvents(
  registry: OntologyRegistry,
  store: GraphStore,
  events: StoredEvent[],
): Promise<NormalizeStats> {
  return withSpan("ingest.normalize", { "events.count": events.length }, async (setAttributes) => {
    const stats: NormalizeStats = { entities: 0, edges: 0, documents: 0, skipped: 0, errors: [] };

    for (const event of events) {
      const ctx = { tenantId: event.tenant_id };
      const ontology = registry.get(event.tenant_id);
      const mapping = ontology.sources[event.source];
      if (!mapping) {
        stats.skipped++;
        log.warn({ source: event.source, event_id: event.id }, "no source mapping; skipped");
        continue;
      }

      try {
        if (event.op === "delete") {
          // Tombstone: the mapping tells us which entity the source row was.
          for (const record of mapping.map(event)) {
            if (record.kind === "entity") {
              await store.deleteEntity(ctx, { type: record.type, key: record.key });
            }
          }
          continue;
        }

        const records = mapping.map(event);
        // Entities first so same-event edges can resolve their endpoints.
        for (const record of records) {
          if (record.kind !== "entity") continue;
          await store.upsertEntity(ctx, ontology, {
            type: record.type,
            properties: record.properties,
          });
          stats.entities++;
        }
        for (const record of records) {
          if (record.kind === "edge") {
            await store.upsertEdge(ctx, ontology, {
              type: record.type,
              src: record.src,
              dst: record.dst,
              properties: record.properties,
              valid_from: record.valid_from ?? event.observed_at,
              valid_to: record.valid_to ?? null,
            });
            stats.edges++;
          } else if (record.kind === "document") {
            const mentionIds: string[] = [];
            for (const ref of record.mentions ?? []) {
              const entity = await store.getEntityByRef(ctx, ref);
              if (entity) mentionIds.push(entity.id);
              else log.warn({ ref, event_id: event.id }, "document mention unresolved");
            }
            await store.upsertDocument(ctx, {
              source: event.source,
              source_id: record.source_id,
              title: record.title,
              body: record.body,
              metadata: record.metadata,
              mentionEntityIds: mentionIds,
            });
            stats.documents++;
          }
        }
      } catch (error) {
        stats.errors.push({ event_id: event.id, error: String(error) });
        log.error({ event_id: event.id, error: String(error) }, "event failed normalization");
      }
    }

    setAttributes({
      "normalize.entities": stats.entities,
      "normalize.edges": stats.edges,
      "normalize.documents": stats.documents,
      "normalize.errors": stats.errors.length,
    });
    return stats;
  });
}
