import { beforeAll, describe, expect, it } from "vitest";
import { FakeEmbedder, docsMentioning, hybridSearch, type Db } from "../src/index";
import { makeStore, makeTestDb, makeTestOntology, TENANT } from "./helpers";

let db: Db;
let lotId: string;
const ontology = makeTestOntology();
const embedder = new FakeEmbedder();

beforeAll(async () => {
  db = await makeTestDb();
  const store = makeStore(db);
  const lot = await store.upsertEntity(TENANT, ontology, {
    type: "SupplierLot",
    properties: { lot_code: "P-88A", component: "pump assembly" },
  });
  lotId = lot.id;
  await store.upsertEntity(TENANT, ontology, {
    type: "SupplierLot",
    properties: { lot_code: "Q-12B", component: "membrane" },
  });
  await store.upsertDocument(TENANT, {
    source: "qc",
    source_id: "qc-7",
    title: "QC report",
    body: "Acoustic test results: pump noise exceeds baseline on several units from lot P-88A.",
    mentionEntityIds: [lot.id],
  });
  await store.upsertDocument(TENANT, {
    source: "qc",
    source_id: "qc-8",
    title: "Membrane inspection",
    body: "Membrane thickness within tolerance for lot Q-12B.",
  });
});

describe("hybridSearch", () => {
  it("finds entities by exact lot code via FTS", async () => {
    const results = await hybridSearch(db, TENANT, embedder, "P-88A");
    expect(results.entities[0]?.key).toBe("P-88A");
  });

  it("finds document chunks by content", async () => {
    const results = await hybridSearch(db, TENANT, embedder, "pump noise baseline");
    expect(results.chunks[0]?.text).toContain("pump noise");
  });

  it("returns nothing for another tenant", async () => {
    const results = await hybridSearch(db, { tenantId: "other" }, embedder, "P-88A");
    expect(results.entities).toHaveLength(0);
    expect(results.chunks).toHaveLength(0);
  });
});

describe("docsMentioning", () => {
  it("returns documents linked to the given entities", async () => {
    const docs = await docsMentioning(db, TENANT, [lotId]);
    expect(docs).toHaveLength(1);
    expect(docs[0]?.title).toBe("QC report");
  });
});
