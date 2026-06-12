import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  composeOntology,
  defineEdgeType,
  defineEntityType,
  defineOntology,
  defineTraversal,
  defineTrigger,
  OntologyRegistry,
  OntologyValidationError,
} from "../src/index";

const Supplier = defineEntityType("Supplier", {
  schema: z.object({ name: z.string(), country: z.string().default("IN") }),
  keys: ["name"],
  card: (p) => `Supplier ${p.name} (${p.country})`,
});

const Batch = defineEntityType("Batch", {
  schema: z.object({ batch_code: z.string(), produced_at: z.string() }),
  keys: ["batch_code"],
  card: (p) => `Batch ${p.batch_code}`,
});

const SUPPLIED_BY = defineEdgeType("SUPPLIED_BY", { src: Batch, dst: Supplier });

const qualityTrace = defineTraversal("quality-trace", {
  steps: [{ edge: "SUPPLIED_BY", direction: "out" }],
  maxNodes: 50,
});

const qualitySpike = defineTrigger("quality-spike", {
  kind: "threshold",
  severity: "critical",
  sql: "SELECT id AS entity_id, '{}'::jsonb AS payload FROM entities WHERE tenant_id = $1",
  dedupeKey: (d) => `quality-spike:${d.entity_id}`,
  traversal: "quality-trace",
  audience: "tenant",
});

function baseOntology() {
  return defineOntology({
    entities: [Supplier, Batch],
    edges: [SUPPLIED_BY],
    triggers: [qualitySpike],
    traversals: [qualityTrace],
    sources: {},
  });
}

describe("defineOntology referential integrity", () => {
  it("rejects edges referencing unknown entity types", () => {
    expect(() =>
      defineOntology({
        entities: [Supplier],
        edges: [defineEdgeType("USES_LOT", { src: "Batch", dst: "SupplierLot" })],
        triggers: [],
        traversals: [],
        sources: {},
      }),
    ).toThrow(/USES_LOT.*Batch/);
  });

  it("rejects triggers referencing unknown traversals", () => {
    expect(() =>
      defineOntology({
        entities: [Supplier, Batch],
        edges: [SUPPLIED_BY],
        triggers: [qualitySpike],
        traversals: [],
        sources: {},
      }),
    ).toThrow(/quality-spike.*quality-trace/);
  });

  it("rejects traversal steps over unknown edges", () => {
    expect(() =>
      defineOntology({
        entities: [Supplier, Batch],
        edges: [],
        triggers: [],
        traversals: [qualityTrace],
        sources: {},
      }),
    ).toThrow(/quality-trace.*SUPPLIED_BY/);
  });
});

describe("write-boundary validation", () => {
  const ontology = baseOntology();

  it("parses valid properties and applies defaults", () => {
    const props = ontology.validateEntity("Supplier", { name: "AquaMotion" });
    expect(props).toEqual({ name: "AquaMotion", country: "IN" });
  });

  it("rejects unknown entity types", () => {
    expect(() => ontology.validateEntity("Widget", {})).toThrow(OntologyValidationError);
  });

  it("rejects schema-invalid properties", () => {
    expect(() => ontology.validateEntity("Batch", { batch_code: 42 })).toThrow(
      OntologyValidationError,
    );
  });

  it("rejects edges whose endpoint types do not match the definition", () => {
    expect(() => ontology.validateEdge("SUPPLIED_BY", "Supplier", "Batch")).toThrow(
      OntologyValidationError,
    );
    expect(() => ontology.validateEdge("SUPPLIED_BY", "Batch", "Supplier")).not.toThrow();
  });

  it("renders entity cards", () => {
    expect(ontology.renderCard("Supplier", { name: "AquaMotion", country: "IN" })).toBe(
      "Supplier AquaMotion (IN)",
    );
  });
});

describe("composeOntology", () => {
  it("extend adds new entity types while keeping base types", () => {
    const Device = defineEntityType("Device", {
      schema: z.object({ serial: z.string() }),
      keys: ["serial"],
      card: (p) => `Device ${p.serial}`,
    });
    const composed = composeOntology(baseOntology(), {
      extend: { entities: [Device] },
    });
    expect(composed.entity("Device").name).toBe("Device");
    expect(composed.entity("Supplier").name).toBe("Supplier");
  });

  it("extend adds fields to an existing entity schema, keeping base validation", () => {
    const composed = composeOntology(baseOntology(), {
      extend: {
        entityFields: { Batch: { water_hardness_zone: z.string().optional() } },
      },
    });
    const props = composed.validateEntity("Batch", {
      batch_code: "B-2231",
      produced_at: "2026-04-01",
      water_hardness_zone: "high",
    });
    expect(props.water_hardness_zone).toBe("high");
    // base requirement still enforced
    expect(() => composed.validateEntity("Batch", { water_hardness_zone: "high" })).toThrow(
      OntologyValidationError,
    );
  });

  it("extend on an unknown entity type throws", () => {
    expect(() =>
      composeOntology(baseOntology(), {
        extend: { entityFields: { Widget: { x: z.string() } } },
      }),
    ).toThrow(/Widget/);
  });

  it("override replaces a trigger wholesale", () => {
    const relaxed = defineTrigger("quality-spike", {
      kind: "threshold",
      severity: "warn",
      sql: "SELECT id AS entity_id, '{}'::jsonb AS payload FROM entities WHERE tenant_id = $1",
      dedupeKey: (d) => `quality-spike:${d.entity_id}`,
      traversal: "quality-trace",
      audience: "tenant",
    });
    const composed = composeOntology(baseOntology(), {
      override: { triggers: [relaxed] },
    });
    expect(composed.trigger("quality-spike").severity).toBe("warn");
  });

  it("override of an unknown definition throws", () => {
    const phantom = defineTrigger("phantom", {
      kind: "event",
      severity: "info",
      match: () => null,
      dedupeKey: () => "phantom",
      traversal: "quality-trace",
      audience: "tenant",
    });
    expect(() => composeOntology(baseOntology(), { override: { triggers: [phantom] } })).toThrow(
      /phantom/,
    );
  });

  it("does not mutate the base ontology", () => {
    const base = baseOntology();
    composeOntology(base, {
      extend: { entityFields: { Batch: { extra: z.string().optional() } } },
    });
    expect(() =>
      base.validateEntity("Batch", {
        batch_code: "B-1",
        produced_at: "2026-01-01",
        extra: "x",
      }),
    ).toThrow(OntologyValidationError); // strict: unknown key rejected on base
  });
});

describe("OntologyRegistry", () => {
  it("resolves registered tenants and rejects unknown ones", () => {
    const registry = new OntologyRegistry();
    const ontology = baseOntology();
    registry.register("demo", ontology);
    expect(registry.get("demo")).toBe(ontology);
    expect(() => registry.get("nope")).toThrow(/nope/);
  });
});
