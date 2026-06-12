import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { ChangeEvent, StoredEvent } from "@sutra/contracts";
import { buildRegistry } from "@sutra/customer-demo";
import { manufacturing } from "@sutra/ontology-manufacturing";
import { FakeEmbedder, GraphStore, migrate, type Db } from "@sutra/graph";
import {
  allEvents,
  InMemoryRawStore,
  normalizeEvents,
  parseRawArtifact,
  parseRawKey,
  RawStoreConnector,
  renderRawArtifact,
  TENANT_ID,
} from "../src/index";

const RAW_SOURCE_OF: Record<string, string[]> = {
  erp: ["sap-erp"],
  tickets: ["zendesk", "analytics"],
  email: ["mail"],
  telemetry: ["analytics"],
};

/** Structural fingerprint of mapped records: graph topology, not prose. */
function fingerprint(records: ReturnType<NonNullable<typeof manufacturing.sources.erp>["map"]>): string[] {
  return records
    .map((r) =>
      r.kind === "entity"
        ? `entity:${r.type}:${r.key}`
        : r.kind === "edge"
          ? `edge:${r.type}:${r.src.type}/${r.src.key}→${r.dst.type}/${r.dst.key}`
          : `document:${r.source_id}`,
    )
    .sort();
}

describe("raw artifact round trip", () => {
  it("every timeline event survives render→parse with identical graph structure", () => {
    for (const event of allEvents()) {
      const artifact = renderRawArtifact(event);
      const meta = parseRawKey(artifact.key);
      expect(RAW_SOURCE_OF[event.source]).toContain(meta.rawSource);

      const parsedPayload = parseRawArtifact(meta.rawSource, artifact.body);
      const parsedEvent: ChangeEvent = { ...event, source: meta.rawSource, payload: parsedPayload };

      const direct = manufacturing.sources[event.source]!.map(event);
      const viaRaw = manufacturing.sources[meta.rawSource]!.map(parsedEvent);
      expect(fingerprint(viaRaw), artifact.key).toEqual(fingerprint(direct));
    }
  });

  it("preserves ticket timestamps exactly (the threshold trigger depends on them)", () => {
    const ticket = allEvents().find((e) => e.source === "tickets")!;
    const artifact = renderRawArtifact(ticket);
    const parsed = parseRawArtifact("zendesk", artifact.body);
    expect(parsed.opened_at).toBe((ticket.payload as { opened_at: string }).opened_at);
  });

  it("re-derives the delay classification from the raw email text", () => {
    const email = allEvents().find(
      (e) => e.source === "email" && (e.payload as { classification?: string }).classification === "delay",
    )!;
    const parsed = parseRawArtifact("mail", renderRawArtifact(email).body);
    expect(parsed).toMatchObject({
      classification: "delay",
      supplier: "AquaMotion Components",
      po_number: "PO-4472",
      delay_days: 10,
    });
    // and it still matches the supplier-delay trigger
    const trigger = manufacturing.trigger("supplier-delay");
    const hit = trigger.match!({ ...email, source: "mail", payload: parsed });
    expect(hit?.entityRef).toEqual({ type: "Supplier", key: "AquaMotion Components" });
  });

  it("builds the same graph through the object-store connector as the direct path", async () => {
    async function makeDb(): Promise<Db> {
      const client = new PGlite({ extensions: { vector } });
      const db = drizzle(client) as unknown as Db;
      await migrate(db);
      return db;
    }
    const toStored = (events: ChangeEvent[]): StoredEvent[] =>
      events.map((event, i) => ({ ...event, id: String(i + 1), processed_at: null }));
    const counts = async (db: Db) => {
      const r = await db.execute(sql`
        SELECT (SELECT count(*) FROM entities)::int AS entities,
               (SELECT count(*) FROM edges)::int AS edges,
               (SELECT count(*) FROM documents)::int AS documents
      `);
      return r.rows[0];
    };

    // Direct path.
    const dbDirect = await makeDb();
    const statsDirect = await normalizeEvents(
      buildRegistry(),
      new GraphStore(dbDirect, new FakeEmbedder()),
      toStored(allEvents()),
    );
    expect(statsDirect.errors).toEqual([]);

    // Raw path: render → object store → connector → parse → normalize.
    const store = new InMemoryRawStore();
    for (const event of allEvents()) await store.putArtifact(renderRawArtifact(event));
    const connector = new RawStoreConnector(store, TENANT_ID);
    const rawEvents: ChangeEvent[] = [];
    for await (const event of connector.fullSync()) rawEvents.push(event);

    const dbRaw = await makeDb();
    const statsRaw = await normalizeEvents(
      buildRegistry(),
      new GraphStore(dbRaw, new FakeEmbedder()),
      toStored(rawEvents),
    );
    expect(statsRaw.errors).toEqual([]);
    expect(statsRaw.skipped).toBe(0);

    expect(await counts(dbRaw)).toEqual(await counts(dbDirect));
  }, 240_000);
});
