import { withSpan, type Signal, type TenantContext } from "@sutra/contracts";
import type { Ontology } from "@sutra/ontology-core";
import {
  docsMentioning,
  extractSubgraph,
  hybridSearch,
  type Db,
  type Embedder,
  type Subgraph,
} from "@sutra/graph";

export type Investigation = {
  subgraph: Subgraph;
  documents: Array<{ id: string; title: string; body: string }>;
  /** Every id the model is allowed to cite. */
  citableIds: Set<string>;
  /** Citable items with their human-readable keys, for citation repair. */
  citables: Array<{ id: string; key?: string }>;
  /** The rendered context block handed to the model. */
  contextText: string;
};

// Signal → relevant subgraph + documents, rendered as structured context with
// stable ids (ARCHITECTURE.md §5 "Investigate"). All retrieval is scoped to
// the tenant; the cap comes from the traversal template.
export async function investigate(
  db: Db,
  embedder: Embedder,
  ctx: TenantContext,
  ontology: Ontology,
  signal: Signal,
): Promise<Investigation> {
  return withSpan(
    "investigate.subgraph",
    { "tenant.id": ctx.tenantId, "signal.id": signal.id, "trigger.key": signal.trigger_key },
    async (setAttributes) => {
      const trigger = ontology.trigger(signal.trigger_key);
      const roots = signal.entity_id ? [signal.entity_id] : [];
      const subgraph = await extractSubgraph(db, ctx, ontology, trigger.traversal, roots);

      const query = [signal.trigger_key, ...Object.values(signal.payload).map(String)]
        .join(" ")
        .slice(0, 200);
      const search = await hybridSearch(db, ctx, embedder, query, 5);
      const mentioned = await docsMentioning(
        db,
        ctx,
        subgraph.nodes.map((n) => n.id),
        5,
      );

      const documents = new Map<string, { id: string; title: string; body: string }>();
      for (const doc of mentioned) documents.set(doc.id, doc);
      for (const chunk of search.chunks) {
        if (!documents.has(chunk.document_id)) {
          documents.set(chunk.document_id, {
            id: chunk.document_id,
            title: chunk.title,
            body: chunk.text,
          });
        }
      }

      const citables = [
        ...subgraph.nodes.map((n) => ({ id: n.id, key: n.key })),
        ...[...documents.values()].map((d) => ({ id: d.id, key: d.title })),
      ];
      const citableIds = new Set(citables.map((c) => c.id));

      const nodeLines = subgraph.nodes.map((n) => `[${n.id}] ${n.type}: ${n.card_text}`);
      const byId = new Map(subgraph.nodes.map((n) => [n.id, n]));
      const edgeLines = subgraph.edges.map((e) => {
        const src = byId.get(e.src);
        const dst = byId.get(e.dst);
        return `${src ? src.card_text : e.src} —${e.type}→ ${dst ? dst.card_text : e.dst}`;
      });
      const docLines = [...documents.values()].map(
        (d) => `[${d.id}] Document "${d.title}":\n${d.body.slice(0, 1200)}`,
      );

      const contextText = [
        `SIGNAL ${signal.trigger_key} (severity ${signal.severity})`,
        `Payload: ${JSON.stringify(signal.payload)}`,
        "",
        "ENTITIES (cite by bracketed id):",
        ...nodeLines,
        "",
        "RELATIONSHIPS:",
        ...edgeLines,
        "",
        "DOCUMENTS (cite by bracketed id):",
        ...docLines,
      ].join("\n");

      setAttributes({
        "investigate.nodes": subgraph.nodes.length,
        "investigate.docs": documents.size,
        "investigate.capped": subgraph.capped,
      });
      return { subgraph, documents: [...documents.values()], citableIds, citables, contextText };
    },
  );
}
