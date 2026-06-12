import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ChangeEvent, StoredEvent } from "@sutra/contracts";
import { composeOntology, OntologyRegistry } from "@sutra/ontology-core";
import { buildRegistry } from "@sutra/customer-demo";
import { manufacturing } from "@sutra/ontology-manufacturing";
import { FakeEmbedder, GraphStore, migrate, type Db } from "@sutra/graph";
import { allEvents, normalizeEvents, TENANT_ID } from "../src/index";

async function makeDb(): Promise<Db> {
  const client = new PGlite({ extensions: { vector } });
  const db = drizzle(client) as unknown as Db;
  await migrate(db);
  return db;
}

function toStored(events: ChangeEvent[]): StoredEvent[] {
  return events.map((event, i) => ({ ...event, id: String(i + 1), processed_at: null }));
}

async function counts(db: Db) {
  const e = await db.execute(sql`SELECT count(*)::int AS n FROM entities`);
  const ed = await db.execute(sql`SELECT count(*)::int AS n FROM edges`);
  const d = await db.execute(sql`SELECT count(*)::int AS n FROM documents`);
  return {
    entities: (e.rows[0] as { n: number }).n,
    edges: (ed.rows[0] as { n: number }).n,
    documents: (d.rows[0] as { n: number }).n,
  };
}

describe("normalizeEvents", () => {
  it("replays the full timeline without errors and builds the expected graph", async () => {
    const db = await makeDb();
    const store = new GraphStore(db, new FakeEmbedder());
    const stats = await normalizeEvents(buildRegistry(), store, toStored(allEvents()));

    expect(stats.errors).toEqual([]);
    expect(stats.skipped).toBe(0);
    expect(stats.documents).toBe(2);

    // The killer-workflow chain exists: M2-0529 → P-88A → AquaMotion, with an open PO.
    const chain = await db.execute(sql`
      SELECT count(*)::int AS n
      FROM entities b
      JOIN edges ul ON ul.type = 'USES_LOT' AND ul.src = b.id
      JOIN entities lot ON lot.id = ul.dst AND lot.key = 'P-88A'
      JOIN edges sb ON sb.type = 'SUPPLIED_BY' AND sb.src = lot.id
      JOIN edges fl ON fl.type = 'FOR_LOT' AND fl.dst = lot.id
      JOIN entities po ON po.id = fl.src AND po.properties->>'status' = 'open'
      WHERE b.type = 'Batch' AND b.key = 'M2-0529' AND b.tenant_id = ${TENANT_ID}
    `);
    expect((chain.rows[0] as { n: number }).n).toBe(1);

    // Document mentions resolved (delay email → supplier + PO).
    const mentions = await db.execute(sql`SELECT count(*)::int AS n FROM doc_mentions`);
    expect((mentions.rows[0] as { n: number }).n).toBe(3);
  }, 120_000);

  it("replays identically into a fresh database", async () => {
    const [db1, db2] = [await makeDb(), await makeDb()];
    const events = toStored(allEvents(45));
    await normalizeEvents(buildRegistry(), new GraphStore(db1, new FakeEmbedder()), events);
    await normalizeEvents(buildRegistry(), new GraphStore(db2, new FakeEmbedder()), events);
    expect(await counts(db1)).toEqual(await counts(db2));
  }, 120_000);

  it("replays the same event log against a modified ontology", async () => {
    const db = await makeDb();
    const store = new GraphStore(db, new FakeEmbedder());
    const modified = composeOntology(manufacturing, {
      extend: { entityFields: { Batch: { line: z.string().optional() } } },
    });
    const registry = new OntologyRegistry();
    registry.register(TENANT_ID, modified);
    const stats = await normalizeEvents(registry, store, toStored(allEvents()));
    expect(stats.errors).toEqual([]);
  }, 120_000);
});
