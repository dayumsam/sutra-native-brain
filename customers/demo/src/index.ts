import { z } from "zod";
import { composeOntology, OntologyRegistry } from "@sutra/ontology-core";
import { manufacturing } from "@sutra/ontology-manufacturing";

export const DEMO_TENANT_ID = "demo";

// The demo customer (Native-style water purifier company) extends the
// manufacturing base. The extension is deliberately small — it exists to keep
// the compose path exercised end-to-end, per the phase-1 spec.
export const demoOntology = composeOntology(manufacturing, {
  extend: {
    entityFields: {
      // Bengaluru-style water-quality segmentation drives the demo's
      // warranty-triage workflow.
      Device: { water_hardness_zone: z.string().optional() },
    },
  },
});

/** Registry with every known tenant bound. The app resolves through this. */
export function buildRegistry(): OntologyRegistry {
  const registry = new OntologyRegistry();
  registry.register(DEMO_TENANT_ID, demoOntology);
  return registry;
}
