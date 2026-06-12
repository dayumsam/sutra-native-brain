import { defineTraversal } from "@sutra/ontology-core";

// Investigation templates, one per trigger family. Step order matters:
// later steps branch off entities collected by earlier ones.

/** Root: Batch — the demo's killer workflow (batch → lot → supplier → POs → fleet). */
export const qualityTrace = defineTraversal("quality-trace", {
  steps: [
    { edge: "USES_LOT", direction: "out", label: "lots used by the batch" },
    { edge: "SUPPLIED_BY", direction: "out", label: "supplier of those lots" },
    { edge: "LOT_OF", direction: "out", label: "component" },
    { edge: "FOR_LOT", direction: "in", label: "purchase orders on those lots" },
    { edge: "BUILT_IN", direction: "in", label: "devices built in the batch" },
    { edge: "ABOUT", direction: "in", label: "tickets on those devices" },
    { edge: "CLAIMS", direction: "in", label: "warranty claims on those devices" },
  ],
  maxNodes: 60,
  weights: { ABOUT: 0.5, CLAIMS: 0.8 },
});

/** Root: Supplier — delay impact (lots → batches → open POs → components). */
export const supplierTrace = defineTraversal("supplier-trace", {
  steps: [
    { edge: "SUPPLIED_BY", direction: "in", label: "lots from this supplier" },
    { edge: "USES_LOT", direction: "in", label: "batches using those lots" },
    { edge: "FOR_LOT", direction: "in", label: "purchase orders on those lots" },
    { edge: "LOT_OF", direction: "out", label: "components" },
  ],
  maxNodes: 40,
});

/** Root: SupplierLot — exposure (supplier, POs, batches, fleet, claims). */
export const lotTrace = defineTraversal("lot-trace", {
  steps: [
    { edge: "SUPPLIED_BY", direction: "out", label: "supplier" },
    { edge: "FOR_LOT", direction: "in", label: "purchase orders on the lot" },
    { edge: "USES_LOT", direction: "in", label: "batches using the lot" },
    { edge: "BUILT_IN", direction: "in", label: "devices in those batches" },
    { edge: "ABOUT", direction: "in", label: "tickets on those devices" },
    { edge: "CLAIMS", direction: "in", label: "warranty claims" },
  ],
  maxNodes: 60,
  weights: { ABOUT: 0.5 },
});

/** Root: TelemetryAnomaly — affected cohort back to batches and lots. */
export const deviceTrace = defineTraversal("device-trace", {
  steps: [
    { edge: "OBSERVED_ON", direction: "out", label: "affected devices" },
    { edge: "BUILT_IN", direction: "out", label: "their batches" },
    { edge: "USES_LOT", direction: "out", label: "lots in those batches" },
    { edge: "ABOUT", direction: "in", label: "tickets on affected devices" },
  ],
  maxNodes: 40,
});

export const TRAVERSALS = [qualityTrace, supplierTrace, lotTrace, deviceTrace];
