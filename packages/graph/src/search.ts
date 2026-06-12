import { sql } from "drizzle-orm";
import { withSpan, type TenantContext } from "@sutra/contracts";
import type { Db } from "./db";
import { toVectorLiteral, type Embedder } from "./embed";

export type EntityHit = { id: string; type: string; key: string; card_text: string; score: number };
export type ChunkHit = {
  id: string;
  document_id: string;
  title: string;
  text: string;
  score: number;
};

export type SearchResults = { entities: EntityHit[]; chunks: ChunkHit[] };

const RRF_K = 60;

// Hybrid retrieval: pgvector cosine + Postgres FTS, merged with reciprocal
// rank fusion. FTS carries exact part/lot codes that embeddings mangle.
export async function hybridSearch(
  db: Db,
  ctx: TenantContext,
  embedder: Embedder,
  query: string,
  k = 8,
): Promise<SearchResults> {
  return withSpan("graph.search", { "tenant.id": ctx.tenantId, "search.k": k }, async (setAttributes) => {
    const [queryVec] = await embedder.embed([query]);
    const vecLiteral = toVectorLiteral(queryVec!);

    const [entityVec, entityFts, chunkVec, chunkFts] = await Promise.all([
      db.execute(sql`
        SELECT id, type, key, card_text FROM entities
        WHERE tenant_id = ${ctx.tenantId} AND deleted_at IS NULL AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vecLiteral}::vector LIMIT ${k}
      `),
      db.execute(sql`
        SELECT id, type, key, card_text FROM entities
        WHERE tenant_id = ${ctx.tenantId} AND deleted_at IS NULL
          AND card_tsv @@ websearch_to_tsquery('english', ${query})
        ORDER BY ts_rank(card_tsv, websearch_to_tsquery('english', ${query})) DESC
        LIMIT ${k}
      `),
      db.execute(sql`
        SELECT c.id, c.document_id, d.title, c.text FROM chunks c
        JOIN documents d ON d.id = c.document_id AND d.deleted_at IS NULL
        WHERE c.tenant_id = ${ctx.tenantId} AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> ${vecLiteral}::vector LIMIT ${k}
      `),
      db.execute(sql`
        SELECT c.id, c.document_id, d.title, c.text FROM chunks c
        JOIN documents d ON d.id = c.document_id AND d.deleted_at IS NULL
        WHERE c.tenant_id = ${ctx.tenantId}
          AND c.tsv @@ websearch_to_tsquery('english', ${query})
        ORDER BY ts_rank(c.tsv, websearch_to_tsquery('english', ${query})) DESC
        LIMIT ${k}
      `),
    ]);

    const entities = rrfMerge<EntityHit>(
      [entityVec.rows, entityFts.rows] as Array<Array<Record<string, unknown>>>,
      (r) => r.id as string,
      (r, score) => ({
        id: r.id as string,
        type: r.type as string,
        key: r.key as string,
        card_text: r.card_text as string,
        score,
      }),
      k,
    );
    const chunks = rrfMerge<ChunkHit>(
      [chunkVec.rows, chunkFts.rows] as Array<Array<Record<string, unknown>>>,
      (r) => r.id as string,
      (r, score) => ({
        id: r.id as string,
        document_id: r.document_id as string,
        title: r.title as string,
        text: r.text as string,
        score,
      }),
      k,
    );

    setAttributes({ "search.entity_hits": entities.length, "search.chunk_hits": chunks.length });
    return { entities, chunks };
  });
}

function rrfMerge<T>(
  rankings: Array<Array<Record<string, unknown>>>,
  idOf: (row: Record<string, unknown>) => string,
  build: (row: Record<string, unknown>, score: number) => T,
  k: number,
): T[] {
  const scores = new Map<string, { row: Record<string, unknown>; score: number }>();
  for (const ranking of rankings) {
    ranking.forEach((row, rank) => {
      const id = idOf(row);
      const entry = scores.get(id) ?? { row, score: 0 };
      entry.score += 1 / (RRF_K + rank + 1);
      scores.set(id, entry);
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ row, score }) => build(row, score));
}

/** Documents linked (via doc_mentions) to any of the given entities. */
export async function docsMentioning(
  db: Db,
  ctx: TenantContext,
  entityIds: string[],
  limit = 5,
): Promise<Array<{ id: string; title: string; body: string }>> {
  if (entityIds.length === 0) return [];
  const result = await db.execute(sql`
    SELECT DISTINCT d.id, d.title, d.body FROM documents d
    JOIN doc_mentions m ON m.document_id = d.id
    WHERE d.tenant_id = ${ctx.tenantId} AND d.deleted_at IS NULL
      AND m.entity_id = ANY(${sql.raw(`ARRAY[${entityIds.map((i) => `'${i.replaceAll("'", "")}'`).join(",")}]::uuid[]`)})
    LIMIT ${limit}
  `);
  return result.rows as Array<{ id: string; title: string; body: string }>;
}
