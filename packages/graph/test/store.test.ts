import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { OntologyValidationError } from "@sutra/ontology-core";
import type { Db } from "../src/index";
import { makeStore, makeTestDb, makeTestOntology, OTHER_TENANT, TENANT } from "./helpers";

let db: Db;
const ontology = makeTestOntology();

beforeAll(async () => {
  db = await makeTestDb();
});

describe("GraphStore entities", () => {
  it("rejects unknown entity types and invalid properties", async () => {
    const store = makeStore(db);
    await expect(
      store.upsertEntity(TENANT, ontology, { type: "Widget", properties: {} }),
    ).rejects.toThrow(OntologyValidationError);
    await expect(
      store.upsertEntity(TENANT, ontology, { type: "Batch", properties: { batch_code: 7 } }),
    ).rejects.toThrow(OntologyValidationError);
  });

  it("upserts idempotently on (tenant, type, key)", async () => {
    const store = makeStore(db);
    const first = await store.upsertEntity(TENANT, ontology, {
      type: "Supplier",
      properties: { name: "AquaMotion" },
    });
    const second = await store.upsertEntity(TENANT, ontology, {
      type: "Supplier",
      properties: { name: "AquaMotion" },
    });
    expect(second.id).toBe(first.id);
    const count = await db.execute(
      sql`SELECT count(*)::int AS n FROM entities WHERE type = 'Supplier' AND tenant_id = 'demo'`,
    );
    expect((count.rows[0] as { n: number }).n).toBe(1);
  });

  it("isolates tenants", async () => {
    const store = makeStore(db);
    await store.upsertEntity(TENANT, ontology, {
      type: "Batch",
      properties: { batch_code: "B-1" },
    });
    const cross = await store.getEntityByRef(OTHER_TENANT, { type: "Batch", key: "B-1" });
    expect(cross).toBeNull();
  });

  it("tombstones on delete and resurrects on re-upsert", async () => {
    const store = makeStore(db);
    await store.upsertEntity(TENANT, ontology, {
      type: "Device",
      properties: { serial: "D-1" },
    });
    await store.deleteEntity(TENANT, { type: "Device", key: "D-1" });
    expect(await store.getEntityByRef(TENANT, { type: "Device", key: "D-1" })).toBeNull();
    await store.upsertEntity(TENANT, ontology, {
      type: "Device",
      properties: { serial: "D-1" },
    });
    expect(await store.getEntityByRef(TENANT, { type: "Device", key: "D-1" })).not.toBeNull();
  });
});

describe("GraphStore edges", () => {
  it("rejects type-mismatched and unresolved endpoints", async () => {
    const store = makeStore(db);
    await expect(
      store.upsertEdge(TENANT, ontology, {
        type: "USES_LOT",
        src: { type: "Supplier", key: "AquaMotion" },
        dst: { type: "Batch", key: "B-1" },
      }),
    ).rejects.toThrow(OntologyValidationError);
    await expect(
      store.upsertEdge(TENANT, ontology, {
        type: "USES_LOT",
        src: { type: "Batch", key: "B-1" },
        dst: { type: "SupplierLot", key: "NOPE" },
      }),
    ).rejects.toThrow(/unresolved endpoint/);
  });

  it("inserts a valid edge", async () => {
    const store = makeStore(db);
    await store.upsertEntity(TENANT, ontology, {
      type: "SupplierLot",
      properties: { lot_code: "P-88A" },
    });
    await store.upsertEdge(TENANT, ontology, {
      type: "USES_LOT",
      src: { type: "Batch", key: "B-1" },
      dst: { type: "SupplierLot", key: "P-88A" },
    });
    const count = await db.execute(sql`SELECT count(*)::int AS n FROM edges WHERE type = 'USES_LOT'`);
    expect((count.rows[0] as { n: number }).n).toBe(1);
  });
});

describe("GraphStore documents", () => {
  it("chunks bodies and links mentions", async () => {
    const store = makeStore(db);
    const batch = await store.getEntityByRef(TENANT, { type: "Batch", key: "B-1" });
    const doc = await store.upsertDocument(TENANT, {
      source: "email",
      source_id: "msg-1",
      title: "Pump noise complaints",
      body: `${"Customers report pump noise on recent units. ".repeat(30)}\n\nLot P-88A suspected.`,
      mentionEntityIds: [batch!.id],
    });
    const chunks = await db.execute(
      sql`SELECT count(*)::int AS n FROM chunks WHERE document_id = ${doc.id}`,
    );
    expect((chunks.rows[0] as { n: number }).n).toBeGreaterThan(1);
    const mentions = await db.execute(
      sql`SELECT count(*)::int AS n FROM doc_mentions WHERE document_id = ${doc.id}`,
    );
    expect((mentions.rows[0] as { n: number }).n).toBe(1);
  });
});
