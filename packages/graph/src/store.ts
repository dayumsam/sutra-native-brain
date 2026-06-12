import { sql } from "drizzle-orm";
import { getLogger, withSpan, type TenantContext } from "@sutra/contracts";
import type { EntityRef, Ontology } from "@sutra/ontology-core";
import type { Db } from "./db";
import { toVectorLiteral, type Embedder } from "./embed";

const log = getLogger("graph.store");

export type EntityRow = {
  id: string;
  type: string;
  key: string;
  properties: Record<string, unknown>;
  card_text: string;
};

const CHUNK_SIZE = 800;

function chunkText(body: string): string[] {
  const paragraphs = body.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && current.length + p.length > CHUNK_SIZE) {
      chunks.push(current.trim());
      current = "";
    }
    current += (current ? "\n\n" : "") + p;
    while (current.length > CHUNK_SIZE) {
      chunks.push(current.slice(0, CHUNK_SIZE));
      current = current.slice(CHUNK_SIZE);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// All writes pass through here: ontology validation is the write boundary.
// Every method is tenant-scoped and spanned.
export class GraphStore {
  constructor(
    private readonly db: Db,
    private readonly embedder: Embedder,
  ) {}

  async upsertEntity(
    ctx: TenantContext,
    ontology: Ontology,
    input: { type: string; properties: Record<string, unknown> },
  ): Promise<EntityRow> {
    return withSpan(
      "graph.upsert_entity",
      { "tenant.id": ctx.tenantId, "entity.type": input.type },
      async () => {
        const properties = ontology.validateEntity(input.type, input.properties);
        const key = ontology.resolutionKey(input.type, properties);
        const cardText = ontology.renderCard(input.type, properties);
        const [embedding] = await this.embedder.embed([cardText]);
        const result = await this.db.execute(sql`
          INSERT INTO entities (tenant_id, type, key, properties, card_text, embedding)
          VALUES (${ctx.tenantId}, ${input.type}, ${key}, ${JSON.stringify(properties)}::jsonb,
                  ${cardText}, ${toVectorLiteral(embedding!)}::vector)
          ON CONFLICT (tenant_id, type, key) DO UPDATE SET
            properties = EXCLUDED.properties,
            card_text = EXCLUDED.card_text,
            embedding = EXCLUDED.embedding,
            updated_at = now(),
            deleted_at = NULL
          RETURNING id, type, key, properties, card_text
        `);
        return result.rows[0] as EntityRow;
      },
    );
  }

  async deleteEntity(ctx: TenantContext, ref: EntityRef): Promise<void> {
    await this.db.execute(sql`
      UPDATE entities SET deleted_at = now(), updated_at = now()
      WHERE tenant_id = ${ctx.tenantId} AND type = ${ref.type} AND key = ${ref.key}
    `);
    log.debug({ tenant: ctx.tenantId, ...ref }, "tombstoned entity");
  }

  async getEntityByRef(ctx: TenantContext, ref: EntityRef): Promise<EntityRow | null> {
    const result = await this.db.execute(sql`
      SELECT id, type, key, properties, card_text FROM entities
      WHERE tenant_id = ${ctx.tenantId} AND type = ${ref.type} AND key = ${ref.key}
        AND deleted_at IS NULL
    `);
    return (result.rows[0] as EntityRow | undefined) ?? null;
  }

  async upsertEdge(
    ctx: TenantContext,
    ontology: Ontology,
    input: {
      type: string;
      src: EntityRef;
      dst: EntityRef;
      properties?: Record<string, unknown>;
      valid_from?: string;
      valid_to?: string | null;
    },
  ): Promise<void> {
    return withSpan(
      "graph.upsert_edge",
      { "tenant.id": ctx.tenantId, "edge.type": input.type },
      async () => {
        ontology.validateEdge(input.type, input.src.type, input.dst.type);
        const src = await this.getEntityByRef(ctx, input.src);
        const dst = await this.getEntityByRef(ctx, input.dst);
        if (!src || !dst) {
          throw new Error(
            `Edge ${input.type}: unresolved endpoint ` +
              `${input.src.type}/${input.src.key} → ${input.dst.type}/${input.dst.key}`,
          );
        }
        await this.db.execute(sql`
          INSERT INTO edges (tenant_id, type, src, dst, properties, valid_from, valid_to)
          VALUES (${ctx.tenantId}, ${input.type}, ${src.id}, ${dst.id},
                  ${JSON.stringify(input.properties ?? {})}::jsonb,
                  ${input.valid_from ?? sql.raw("now()")}, ${input.valid_to ?? null})
          ON CONFLICT (tenant_id, type, src, dst, valid_from) DO UPDATE SET
            properties = EXCLUDED.properties, valid_to = EXCLUDED.valid_to
        `);
      },
    );
  }

  async upsertDocument(
    ctx: TenantContext,
    input: {
      source: string;
      source_id: string;
      title: string;
      body: string;
      metadata?: Record<string, unknown>;
      /** Entity ids this document mentions (already resolved). */
      mentionEntityIds?: string[];
    },
  ): Promise<{ id: string }> {
    return withSpan(
      "graph.upsert_document",
      { "tenant.id": ctx.tenantId, "doc.source": input.source },
      async (setAttributes) => {
        const result = await this.db.execute(sql`
          INSERT INTO documents (tenant_id, source, source_id, title, body, metadata)
          VALUES (${ctx.tenantId}, ${input.source}, ${input.source_id}, ${input.title},
                  ${input.body}, ${JSON.stringify(input.metadata ?? {})}::jsonb)
          ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
            title = EXCLUDED.title, body = EXCLUDED.body,
            metadata = EXCLUDED.metadata, updated_at = now(), deleted_at = NULL
          RETURNING id
        `);
        const docId = (result.rows[0] as { id: string }).id;

        const texts = chunkText(input.body);
        const embeddings = await this.embedder.embed(texts);
        await this.db.execute(sql`DELETE FROM chunks WHERE document_id = ${docId}`);
        for (let i = 0; i < texts.length; i++) {
          await this.db.execute(sql`
            INSERT INTO chunks (tenant_id, document_id, seq, text, embedding)
            VALUES (${ctx.tenantId}, ${docId}, ${i}, ${texts[i]!},
                    ${toVectorLiteral(embeddings[i]!)}::vector)
          `);
        }
        for (const entityId of input.mentionEntityIds ?? []) {
          await this.db.execute(sql`
            INSERT INTO doc_mentions (document_id, entity_id)
            VALUES (${docId}, ${entityId}) ON CONFLICT DO NOTHING
          `);
        }
        setAttributes({ "doc.chunks": texts.length });
        return { id: docId };
      },
    );
  }
}
