import type { ChangeEvent } from "@sutra/contracts";
import type { MappedRecord, SourceMapping } from "@sutra/ontology-core";

// Field mappings from source payloads to canonical records. The synthetic
// connector emits flat rows shaped like real source systems would, so this
// layer does genuine translation work — swapping in a real ERP connector
// later only changes the payload shapes handled here.

type P = Record<string, unknown>;
const s = (v: unknown) => (v == null ? undefined : String(v));
const n = (v: unknown) => (v == null ? undefined : Number(v));

function erpMap(event: ChangeEvent): MappedRecord[] {
  const p = event.payload as P;
  switch (p.entity) {
    case "supplier":
      return [
        {
          kind: "entity",
          type: "Supplier",
          key: String(p.name),
          properties: { name: s(p.name), location: s(p.location), rating: n(p.rating) },
        },
      ];
    case "component":
      return [
        {
          kind: "entity",
          type: "Component",
          key: String(p.part_no),
          properties: { part_no: s(p.part_no), name: s(p.name), category: s(p.category) },
        },
      ];
    case "lot": {
      const records: MappedRecord[] = [
        {
          kind: "entity",
          type: "SupplierLot",
          key: String(p.lot_code),
          properties: {
            lot_code: s(p.lot_code),
            component_part_no: s(p.component),
            received_at: s(p.received_at),
          },
        },
      ];
      if (p.supplier) {
        records.push({
          kind: "edge",
          type: "SUPPLIED_BY",
          src: { type: "SupplierLot", key: String(p.lot_code) },
          dst: { type: "Supplier", key: String(p.supplier) },
        });
      }
      if (p.component) {
        records.push({
          kind: "edge",
          type: "LOT_OF",
          src: { type: "SupplierLot", key: String(p.lot_code) },
          dst: { type: "Component", key: String(p.component) },
        });
      }
      return records;
    }
    case "batch": {
      const records: MappedRecord[] = [
        {
          kind: "entity",
          type: "Batch",
          key: String(p.batch_code),
          properties: {
            batch_code: s(p.batch_code),
            product_model: s(p.product_model),
            produced_at: s(p.produced_at),
            units: n(p.units),
          },
        },
      ];
      if (p.lot) {
        records.push({
          kind: "edge",
          type: "USES_LOT",
          src: { type: "Batch", key: String(p.batch_code) },
          dst: { type: "SupplierLot", key: String(p.lot) },
        });
      }
      return records;
    }
    case "po": {
      const records: MappedRecord[] = [
        {
          kind: "entity",
          type: "PurchaseOrder",
          key: String(p.po_number),
          properties: {
            po_number: s(p.po_number),
            status: s(p.status),
            qty: n(p.qty),
            due_date: s(p.due_date),
          },
        },
      ];
      if (p.component) {
        records.push({
          kind: "edge",
          type: "SUPPLIES",
          src: { type: "PurchaseOrder", key: String(p.po_number) },
          dst: { type: "Component", key: String(p.component) },
        });
      }
      if (p.lot) {
        records.push({
          kind: "edge",
          type: "FOR_LOT",
          src: { type: "PurchaseOrder", key: String(p.po_number) },
          dst: { type: "SupplierLot", key: String(p.lot) },
        });
      }
      return records;
    }
    case "device": {
      const records: MappedRecord[] = [
        {
          kind: "entity",
          type: "Device",
          key: String(p.serial),
          properties: {
            serial: s(p.serial),
            model: s(p.model),
            installed_at: s(p.installed_at),
            city: s(p.city),
          },
        },
      ];
      if (p.batch) {
        records.push({
          kind: "edge",
          type: "BUILT_IN",
          src: { type: "Device", key: String(p.serial) },
          dst: { type: "Batch", key: String(p.batch) },
        });
      }
      return records;
    }
    case "warranty_claim": {
      const records: MappedRecord[] = [
        {
          kind: "entity",
          type: "WarrantyClaim",
          key: String(p.claim_no),
          properties: {
            claim_no: s(p.claim_no),
            amount_inr: n(p.amount_inr),
            filed_at: s(p.filed_at),
            failure_mode: s(p.failure_mode),
          },
        },
      ];
      if (p.device) {
        records.push({
          kind: "edge",
          type: "CLAIMS",
          src: { type: "WarrantyClaim", key: String(p.claim_no) },
          dst: { type: "Device", key: String(p.device) },
        });
      }
      return records;
    }
    default:
      return [];
  }
}

function ticketsMap(event: ChangeEvent): MappedRecord[] {
  const p = event.payload as P;
  if (p.entity === "cluster") {
    const records: MappedRecord[] = [
      {
        kind: "entity",
        type: "ComplaintCluster",
        key: String(p.cluster_key),
        properties: {
          cluster_key: s(p.cluster_key),
          issue: s(p.issue),
          count: n(p.count),
          window_days: n(p.window_days),
          ratio: n(p.ratio),
        },
      },
    ];
    for (const ticketNo of (p.tickets as string[] | undefined) ?? []) {
      records.push({
        kind: "edge",
        type: "CLUSTERS",
        src: { type: "ComplaintCluster", key: String(p.cluster_key) },
        dst: { type: "ServiceTicket", key: ticketNo },
      });
    }
    return records;
  }
  const records: MappedRecord[] = [
    {
      kind: "entity",
      type: "ServiceTicket",
      key: String(p.ticket_no),
      properties: {
        ticket_no: s(p.ticket_no),
        issue: s(p.issue),
        status: s(p.status),
        city: s(p.city),
        opened_at: s(p.opened_at),
      },
    },
  ];
  if (p.device) {
    records.push({
      kind: "edge",
      type: "ABOUT",
      src: { type: "ServiceTicket", key: String(p.ticket_no) },
      dst: { type: "Device", key: String(p.device) },
    });
  }
  return records;
}

function emailMap(event: ChangeEvent): MappedRecord[] {
  const p = event.payload as P;
  return [
    {
      kind: "document",
      source_id: String(p.message_id),
      title: String(p.subject ?? "(no subject)"),
      body: String(p.body ?? ""),
      metadata: { from: s(p.from), classification: s(p.classification) },
      mentions: (p.mentions as Array<{ type: string; key: string }> | undefined) ?? [],
    },
  ];
}

function telemetryMap(event: ChangeEvent): MappedRecord[] {
  const p = event.payload as P;
  const records: MappedRecord[] = [
    {
      kind: "entity",
      type: "TelemetryAnomaly",
      key: String(p.anomaly_key),
      properties: {
        anomaly_key: s(p.anomaly_key),
        metric: s(p.metric),
        magnitude: n(p.magnitude),
        window_days: n(p.window_days),
        city: s(p.city),
      },
    },
  ];
  for (const serial of (p.devices as string[] | undefined) ?? []) {
    records.push({
      kind: "edge",
      type: "OBSERVED_ON",
      src: { type: "TelemetryAnomaly", key: String(p.anomaly_key) },
      dst: { type: "Device", key: serial },
    });
  }
  return records;
}

export const SOURCES: Record<string, SourceMapping> = {
  erp: { map: erpMap },
  tickets: { map: ticketsMap },
  email: { map: emailMap },
  telemetry: { map: telemetryMap },
};
