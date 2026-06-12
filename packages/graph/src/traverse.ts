import { sql } from "drizzle-orm";
import { withSpan, type TenantContext } from "@sutra/contracts";
import type { Ontology } from "@sutra/ontology-core";
import type { Db } from "./db";

export type SubgraphNode = {
  id: string;
  type: string;
  key: string;
  card_text: string;
  properties: Record<string, unknown>;
};

export type SubgraphEdge = {
  id: string;
  type: string;
  src: string;
  dst: string;
};

export type Subgraph = {
  nodes: SubgraphNode[];
  edges: SubgraphEdge[];
  /** True when maxNodes pruned candidates — surfaced in traces and the UI. */
  capped: boolean;
};

// Typed traversal: each step expands the set of collected nodes along one
// declared edge type. Steps run in template order, so later steps can branch
// off entities found earlier (lot → open POs after lot → supplier). Candidates
// beyond maxNodes are pruned by edge-type weight, then recency.
export async function extractSubgraph(
  db: Db,
  ctx: TenantContext,
  ontology: Ontology,
  traversalName: string,
  rootIds: string[],
): Promise<Subgraph> {
  const traversal = ontology.traversal(traversalName);
  return withSpan(
    "graph.traverse",
    { "tenant.id": ctx.tenantId, "traversal.name": traversalName, "roots.count": rootIds.length },
    async (setAttributes) => {
      const nodes = new Map<string, SubgraphNode>();
      const edges = new Map<string, SubgraphEdge>();
      let capped = false;

      if (rootIds.length > 0) {
        const rootResult = await db.execute(sql`
          SELECT id, type, key, card_text, properties FROM entities
          WHERE tenant_id = ${ctx.tenantId} AND id = ANY(${sql.raw(idArray(rootIds))})
            AND deleted_at IS NULL
        `);
        for (const row of rootResult.rows) {
          const n = row as SubgraphNode;
          nodes.set(n.id, n);
        }
      }

      for (const step of traversal.steps) {
        if (nodes.size >= traversal.maxNodes) {
          capped = true;
          break;
        }
        const remaining = traversal.maxNodes - nodes.size;
        const fromIds = [...nodes.keys()];
        if (fromIds.length === 0) break;

        const weight = traversal.weights?.[step.edge] ?? 1;
        const [anchor, expand] = step.direction === "out" ? ["src", "dst"] : ["dst", "src"];
        const result = await db.execute(sql`
          SELECT e.id AS edge_id, e.type AS edge_type, e.src, e.dst,
                 n.id, n.type, n.key, n.card_text, n.properties
          FROM edges e
          JOIN entities n ON n.id = e.${sql.raw(expand!)}
          WHERE e.tenant_id = ${ctx.tenantId}
            AND e.type = ${step.edge}
            AND e.${sql.raw(anchor!)} = ANY(${sql.raw(idArray(fromIds))})
            AND e.valid_to IS NULL
            AND n.deleted_at IS NULL
          ORDER BY ${weight} * extract(epoch FROM e.observed_at) DESC
          LIMIT ${remaining + 1}
        `);

        let added = 0;
        for (const row of result.rows) {
          const r = row as SubgraphNode & { edge_id: string; edge_type: string; src: string; dst: string };
          if (added >= remaining && !nodes.has(r.id)) {
            capped = true;
            break;
          }
          if (!nodes.has(r.id)) {
            nodes.set(r.id, {
              id: r.id, type: r.type, key: r.key,
              card_text: r.card_text, properties: r.properties,
            });
            added++;
          }
          edges.set(r.edge_id, { id: r.edge_id, type: r.edge_type, src: r.src, dst: r.dst });
        }
      }

      setAttributes({ "subgraph.nodes": nodes.size, "subgraph.edges": edges.size, "subgraph.capped": capped });
      return { nodes: [...nodes.values()], edges: [...edges.values()], capped };
    },
  );
}

function idArray(ids: string[]): string {
  return `ARRAY[${ids.map((i) => `'${i.replaceAll("'", "")}'`).join(",")}]::uuid[]`;
}
