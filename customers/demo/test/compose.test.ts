import { describe, expect, it } from "vitest";
import { manufacturing } from "@sutra/ontology-manufacturing";
import { buildRegistry, DEMO_TENANT_ID, demoOntology } from "../src/index";

describe("demo customer ontology", () => {
  it("accepts the customer-specific Device field", () => {
    const props = demoOntology.validateEntity("Device", {
      serial: "NM2-8841",
      model: "Native M2",
      city: "Bengaluru",
      water_hardness_zone: "high",
    });
    expect(props.water_hardness_zone).toBe("high");
  });

  it("leaves the vertical base unaffected", () => {
    expect(() =>
      manufacturing.validateEntity("Device", {
        serial: "NM2-8841",
        model: "Native M2",
        water_hardness_zone: "high",
      }),
    ).toThrow();
  });

  it("binds the tenant in the registry", () => {
    const registry = buildRegistry();
    expect(registry.get(DEMO_TENANT_ID)).toBe(demoOntology);
    expect(registry.tenantIds()).toEqual([DEMO_TENANT_ID]);
  });
});
