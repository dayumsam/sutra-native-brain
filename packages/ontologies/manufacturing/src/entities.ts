import { z } from "zod";
import { defineEntityType } from "@sutra/ontology-core";

// Fields mirror what the demo UI displays (lib/demo-data.ts) so graph-backed
// rendering can reuse the same shapes.

export const Supplier = defineEntityType("Supplier", {
  schema: z.object({
    name: z.string(),
    location: z.string().optional(),
    rating: z.number().optional(),
    lead_time_days: z.number().optional(),
  }),
  keys: ["name"],
  card: (p) => `Supplier ${p.name}${p.location ? ` (${p.location})` : ""}`,
});

export const Component = defineEntityType("Component", {
  schema: z.object({
    part_no: z.string(),
    name: z.string(),
    category: z.string().optional(),
  }),
  keys: ["part_no"],
  card: (p) => `Component ${p.name} (part ${p.part_no})`,
});

export const SupplierLot = defineEntityType("SupplierLot", {
  schema: z.object({
    lot_code: z.string(),
    component_part_no: z.string().optional(),
    received_at: z.string().optional(),
  }),
  keys: ["lot_code"],
  card: (p) => `Supplier lot ${p.lot_code}${p.component_part_no ? ` of part ${p.component_part_no}` : ""}`,
});

export const Batch = defineEntityType("Batch", {
  schema: z.object({
    batch_code: z.string(),
    product_model: z.string(),
    produced_at: z.string(),
    units: z.number().optional(),
  }),
  keys: ["batch_code"],
  card: (p) => `Production batch ${p.batch_code} of ${p.product_model} (produced ${p.produced_at})`,
});

export const PurchaseOrder = defineEntityType("PurchaseOrder", {
  schema: z.object({
    po_number: z.string(),
    status: z.enum(["open", "closed", "cancelled"]),
    qty: z.number().optional(),
    due_date: z.string().optional(),
  }),
  keys: ["po_number"],
  card: (p) => `Purchase order ${p.po_number} (${p.status}${p.due_date ? `, due ${p.due_date}` : ""})`,
});

export const Device = defineEntityType("Device", {
  schema: z.object({
    serial: z.string(),
    model: z.string(),
    installed_at: z.string().optional(),
    city: z.string().optional(),
  }),
  keys: ["serial"],
  card: (p) => `Device ${p.serial} (${p.model}${p.city ? `, ${p.city}` : ""})`,
});

export const ServiceTicket = defineEntityType("ServiceTicket", {
  schema: z.object({
    ticket_no: z.string(),
    issue: z.string(),
    status: z.string(),
    city: z.string().optional(),
    opened_at: z.string(),
  }),
  keys: ["ticket_no"],
  card: (p) => `Service ticket ${p.ticket_no}: ${p.issue} (${p.status}, opened ${p.opened_at})`,
});

export const ComplaintCluster = defineEntityType("ComplaintCluster", {
  schema: z.object({
    cluster_key: z.string(),
    issue: z.string(),
    count: z.number(),
    window_days: z.number(),
    ratio: z.number(),
  }),
  keys: ["cluster_key"],
  card: (p) =>
    `Complaint cluster ${p.cluster_key}: ${p.issue} — ${p.count} tickets in ${p.window_days} days (${p.ratio}× baseline)`,
});

export const WarrantyClaim = defineEntityType("WarrantyClaim", {
  schema: z.object({
    claim_no: z.string(),
    amount_inr: z.number().optional(),
    filed_at: z.string(),
    failure_mode: z.string().optional(),
  }),
  keys: ["claim_no"],
  card: (p) => `Warranty claim ${p.claim_no} (${p.failure_mode ?? "unspecified"}, filed ${p.filed_at})`,
});

export const TelemetryAnomaly = defineEntityType("TelemetryAnomaly", {
  schema: z.object({
    anomaly_key: z.string(),
    metric: z.string(),
    magnitude: z.number(),
    window_days: z.number(),
    city: z.string().optional(),
  }),
  keys: ["anomaly_key"],
  card: (p) =>
    `Telemetry anomaly ${p.anomaly_key}: ${p.metric} at ${p.magnitude}× baseline over ${p.window_days} days`,
});

export const ENTITIES = [
  Supplier,
  Component,
  SupplierLot,
  Batch,
  PurchaseOrder,
  Device,
  ServiceTicket,
  ComplaintCluster,
  WarrantyClaim,
  TelemetryAnomaly,
];
