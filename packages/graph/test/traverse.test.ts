import { beforeAll, describe, expect, it } from "vitest";
import { composeOntology, defineTraversal } from "@sutra/ontology-core";
import { extractSubgraph, type Db } from "../src/index";
import { makeStore, makeTestDb, makeTestOntology, TENANT } from "./helpers";

let db: Db;
let batchId: string;
const ontology = makeTestOntology();

beforeAll(async () => {
  db = await makeTestDb();
  const store = makeStore(db);
  const e = (type: string, properties: Record<string, unknown>) =>
    store.upsertEntity(TENANT, ontology, { type, properties });

  const batch = await e("Batch", { batch_code: "B-2231" });
  batchId = batch.id;
  await e("SupplierLot", { lot_code: "P-88A" });
  await e("Supplier", { name: "AquaMotion" });
  await e("PurchaseOrder", { po_number: "PO-9001", status: "open" });
  await e("Device", { serial: "D-4411" });

  const edge = (type: string, src: [string, string], dst: [string, string]) =>
    store.upsertEdge(TENANT, ontology, {
      type,
      src: { type: src[0], key: src[1] },
      dst: { type: dst[0], key: dst[1] },
    });
  await edge("USES_LOT", ["Batch", "B-2231"], ["SupplierLot", "P-88A"]);
  await edge("SUPPLIED_BY", ["SupplierLot", "P-88A"], ["Supplier", "AquaMotion"]);
  await edge("FOR_LOT", ["PurchaseOrder", "PO-9001"], ["SupplierLot", "P-88A"]);
  await edge("BUILT_IN", ["Device", "D-4411"], ["Batch", "B-2231"]);
});

describe("extractSubgraph", () => {
  it("follows the declared chain across out- and in-edges", async () => {
    const subgraph = await extractSubgraph(db, TENANT, ontology, "quality-trace", [batchId]);
    const types = subgraph.nodes.map((n) => n.type).sort();
    expect(types).toEqual(["Batch", "Device", "PurchaseOrder", "Supplier", "SupplierLot"]);
    expect(subgraph.edges).toHaveLength(4);
    expect(subgraph.capped).toBe(false);
  });

  it("respects the node cap and flags pruning", async () => {
    const tight = composeOntology(ontology, {
      override: {
        traversals: [
          defineTraversal("quality-trace", {
            steps: [
              { edge: "USES_LOT", direction: "out" },
              { edge: "SUPPLIED_BY", direction: "out" },
              { edge: "FOR_LOT", direction: "in" },
              { edge: "BUILT_IN", direction: "in" },
            ],
            maxNodes: 3,
          }),
        ],
      },
    });
    const subgraph = await extractSubgraph(db, TENANT, tight, "quality-trace", [batchId]);
    expect(subgraph.nodes.length).toBeLessThanOrEqual(3);
    expect(subgraph.capped).toBe(true);
  });

  it("returns nothing for another tenant", async () => {
    const subgraph = await extractSubgraph(
      db,
      { tenantId: "other" },
      ontology,
      "quality-trace",
      [batchId],
    );
    expect(subgraph.nodes).toHaveLength(0);
  });
});
