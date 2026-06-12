import { describe, expect, it } from "vitest";
import { manufacturing, SOURCES } from "../src/index";

describe("manufacturing ontology", () => {
  it("constructs with full referential integrity", () => {
    expect(manufacturing.entityTypes()).toHaveLength(10);
    expect(manufacturing.edgeTypes()).toHaveLength(10);
    expect(manufacturing.triggerDefs()).toHaveLength(4);
  });

  it("maps an ERP batch row to an entity plus USES_LOT edge", () => {
    const records = SOURCES.erp!.map({
      source: "erp",
      source_id: "batch-M2-0529",
      tenant_id: "demo",
      op: "upsert",
      payload: {
        entity: "batch",
        batch_code: "M2-0529",
        product_model: "Native M2",
        produced_at: "2026-03-12",
        units: 1200,
        lot: "P-88A",
      },
      acl: {},
      observed_at: "2026-03-12T00:00:00.000Z",
    });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ kind: "entity", type: "Batch", key: "M2-0529" });
    expect(records[1]).toMatchObject({
      kind: "edge",
      type: "USES_LOT",
      dst: { type: "SupplierLot", key: "P-88A" },
    });
    // mapped properties pass the write-boundary gate
    const entity = records[0] as { properties: Record<string, unknown> };
    expect(() => manufacturing.validateEntity("Batch", entity.properties)).not.toThrow();
  });

  it("supplier-delay matches only classified delay emails", () => {
    const trigger = manufacturing.trigger("supplier-delay");
    const base = {
      source: "email",
      source_id: "m1",
      tenant_id: "demo",
      op: "upsert" as const,
      acl: {},
      observed_at: "2026-04-20T08:00:00.000Z",
    };
    const hit = trigger.match!({
      ...base,
      payload: {
        classification: "delay",
        supplier: "AquaMotion Components",
        po_number: "PO-4472",
        delay_days: 10,
      },
    });
    expect(hit?.entityRef).toEqual({ type: "Supplier", key: "AquaMotion Components" });
    expect(trigger.dedupeKey({ entity_id: null, payload: hit!.payload })).toBe(
      "supplier-delay:PO-4472",
    );
    expect(trigger.match!({ ...base, payload: { classification: "invoice" } })).toBeNull();
    expect(trigger.match!({ ...base, source: "tickets", payload: {} })).toBeNull();
  });
});
