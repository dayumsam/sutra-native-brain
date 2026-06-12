import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { z } from "zod";
import {
  defineEdgeType,
  defineEntityType,
  defineOntology,
  defineTraversal,
} from "@sutra/ontology-core";
import { FakeEmbedder, GraphStore, migrate, type Db } from "../src/index";

export async function makeTestDb(): Promise<Db> {
  const client = new PGlite({ extensions: { vector } });
  const db = drizzle(client) as unknown as Db;
  await migrate(db);
  return db;
}

const Supplier = defineEntityType("Supplier", {
  schema: z.object({ name: z.string() }),
  keys: ["name"],
  card: (p) => `Supplier ${p.name}`,
});
const SupplierLot = defineEntityType("SupplierLot", {
  schema: z.object({ lot_code: z.string(), component: z.string().default("pump") }),
  keys: ["lot_code"],
  card: (p) => `Supplier lot ${p.lot_code} (${p.component})`,
});
const Batch = defineEntityType("Batch", {
  schema: z.object({ batch_code: z.string() }),
  keys: ["batch_code"],
  card: (p) => `Production batch ${p.batch_code}`,
});
const Device = defineEntityType("Device", {
  schema: z.object({ serial: z.string() }),
  keys: ["serial"],
  card: (p) => `Device ${p.serial}`,
});
const PurchaseOrder = defineEntityType("PurchaseOrder", {
  schema: z.object({ po_number: z.string(), status: z.string().default("open") }),
  keys: ["po_number"],
  card: (p) => `Purchase order ${p.po_number} (${p.status})`,
});

export function makeTestOntology() {
  return defineOntology({
    entities: [Supplier, SupplierLot, Batch, Device, PurchaseOrder],
    edges: [
      defineEdgeType("USES_LOT", { src: Batch, dst: SupplierLot }),
      defineEdgeType("SUPPLIED_BY", { src: SupplierLot, dst: Supplier }),
      defineEdgeType("FOR_LOT", { src: PurchaseOrder, dst: SupplierLot }),
      defineEdgeType("BUILT_IN", { src: Device, dst: Batch }),
    ],
    triggers: [],
    traversals: [
      defineTraversal("quality-trace", {
        steps: [
          { edge: "USES_LOT", direction: "out" },
          { edge: "SUPPLIED_BY", direction: "out" },
          { edge: "FOR_LOT", direction: "in" },
          { edge: "BUILT_IN", direction: "in" },
        ],
        maxNodes: 50,
      }),
    ],
    sources: {},
  });
}

export function makeStore(db: Db): GraphStore {
  return new GraphStore(db, new FakeEmbedder());
}

export const TENANT = { tenantId: "demo" };
export const OTHER_TENANT = { tenantId: "other" };
