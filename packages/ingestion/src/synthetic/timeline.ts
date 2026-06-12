import type { ChangeEvent } from "@sutra/contracts";

// Deterministic ~90-day operational timeline for the demo tenant.
// Everything is derived from constants + a seeded PRNG keyed by day, so
// eventsForDay(d) is pure: same day → same events, in any call order.
//
// Scripted incidents (spec §5):
//   1. Pump-noise complaint spike on batch M2-0529 (lot P-88A, AquaMotion),
//      days 55–70, with open PO-4472 on the same lot → quality-spike +
//      lot-exposure triggers.
//   2. Supplier delay email on PO-4472, day 60 → supplier-delay trigger.
//   3. Telemetry drift on an M2-0529 device cohort, day 65 → telemetry-drift.

export const TENANT_ID = "demo";
export const TIMELINE_DAYS = 90;
const SEED = 0x5eed;

const T0 = Date.UTC(2026, 2, 1); // 2026-03-01

export function dateOf(day: number, hour = 8): string {
  return new Date(T0 + day * 86_400_000 + hour * 3_600_000).toISOString();
}

function rngFor(day: number, salt: number): () => number {
  let a = (SEED ^ Math.imul(day + 1, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ev(
  source: string,
  sourceId: string,
  day: number,
  payload: Record<string, unknown>,
  hour = 8,
): ChangeEvent {
  return {
    source,
    source_id: sourceId,
    tenant_id: TENANT_ID,
    op: "upsert",
    payload,
    acl: {},
    observed_at: dateOf(day, hour),
  };
}

// --- Static catalog -------------------------------------------------------

type CatalogItem = { day: number; event: ChangeEvent };

const BATCHES = [
  { code: "M2-0518", lot: "P-87F", producedDay: 5, installStart: 10, devices: 50 },
  { code: "M2-0529", lot: "P-88A", producedDay: 33, installStart: 36, devices: 50 },
  { code: "M2-0602", lot: "P-88A", producedDay: 40, installStart: 44, devices: 50 },
] as const;

export const SPIKE_BATCH = "M2-0529";
export const SPIKE_LOT = "P-88A";
const SPIKE_START = 55;
const SPIKE_END = 70;
const CLUSTER_DAY = 68;
const DELAY_EMAIL_DAY = 60;
const TELEMETRY_DAY = 65;
const CITIES = ["Bengaluru", "Hyderabad", "Pune", "Chennai"];

type DeviceDef = { serial: string; batch: string; installDay: number; city: string };

const DEVICES: DeviceDef[] = BATCHES.flatMap((batch) =>
  Array.from({ length: batch.devices }, (_, j) => ({
    serial: `NM2-${batch.code.slice(3)}-${String(j + 1).padStart(3, "0")}`,
    batch: batch.code,
    installDay: batch.installStart + Math.floor(j * 0.8),
    city: CITIES[j % CITIES.length]!,
  })),
);

function catalog(): CatalogItem[] {
  const items: CatalogItem[] = [];
  const add = (day: number, event: ChangeEvent) => items.push({ day, event });

  add(0, ev("erp", "sup-aquamotion", 0, { entity: "supplier", name: "AquaMotion Components", location: "Pune", rating: 4.2 }));
  add(0, ev("erp", "sup-flowdrive", 0, { entity: "supplier", name: "FlowDrive Systems", location: "Pune", rating: 4.6 }));
  add(0, ev("erp", "sup-mempure", 0, { entity: "supplier", name: "MemPure Filtration", location: "Chennai", rating: 4.4 }));
  add(0, ev("erp", "comp-p200", 0, { entity: "component", part_no: "P-200-C", name: "Pump P-200", category: "pump" }));
  add(0, ev("erp", "comp-mv2", 0, { entity: "component", part_no: "M-V2", name: "MemPure V2 membrane", category: "membrane" }));
  add(0, ev("erp", "comp-pfr4", 0, { entity: "component", part_no: "PF-R4", name: "Sediment pre-filter", category: "filter" }));

  add(1, ev("erp", "lot-p87f", 1, { entity: "lot", lot_code: "P-87F", component: "P-200-C", supplier: "AquaMotion Components", received_at: dateOf(1) }));
  add(1, ev("erp", "lot-q12b", 1, { entity: "lot", lot_code: "Q-12B", component: "M-V2", supplier: "MemPure Filtration", received_at: dateOf(1) }));
  add(5, ev("erp", "po-4471", 5, { entity: "po", po_number: "PO-4471", status: "closed", component: "P-200-C", lot: "P-87F", qty: 1500 }));
  add(30, ev("erp", "lot-p88a", 30, { entity: "lot", lot_code: "P-88A", component: "P-200-C", supplier: "AquaMotion Components", received_at: dateOf(30) }));
  add(30, ev("erp", "po-4472", 30, { entity: "po", po_number: "PO-4472", status: "open", component: "P-200-C", lot: "P-88A", qty: 5000, due_date: dateOf(70) }));
  add(45, ev("erp", "po-4473", 45, { entity: "po", po_number: "PO-4473", status: "open", component: "M-V2", lot: "Q-12B", qty: 3000, due_date: dateOf(95) }));

  for (const batch of BATCHES) {
    add(batch.producedDay, ev("erp", `batch-${batch.code}`, batch.producedDay, {
      entity: "batch", batch_code: batch.code, product_model: "Native M2",
      produced_at: dateOf(batch.producedDay), units: 1200, lot: batch.lot,
    }));
  }
  for (const device of DEVICES) {
    add(device.installDay, ev("erp", `dev-${device.serial}`, device.installDay, {
      entity: "device", serial: device.serial, model: "Native M2",
      installed_at: dateOf(device.installDay), city: device.city, batch: device.batch,
    }));
  }
  return items;
}

const CATALOG = catalog();

// --- Tickets --------------------------------------------------------------

const BASELINE_ISSUES = ["low water flow", "filter warning", "TDS reading high", "leakage at joint"];

function installedDevices(uptoDay: number, batch?: string): DeviceDef[] {
  return DEVICES.filter((d) => d.installDay < uptoDay && (!batch || d.batch === batch));
}

function baselineTickets(day: number): ChangeEvent[] {
  if (day < 12) return [];
  const rng = rngFor(day, 1);
  const pool = installedDevices(day);
  if (pool.length === 0) return [];
  return Array.from({ length: 2 }, (_, i) => {
    const device = pool[Math.floor(rng() * pool.length)]!;
    const issue = BASELINE_ISSUES[Math.floor(rng() * BASELINE_ISSUES.length)]!;
    const ticketNo = `ST-${day}-B${i + 1}`;
    return ev("tickets", ticketNo, day, {
      ticket_no: ticketNo, issue, status: "open", city: device.city,
      opened_at: dateOf(day, 9 + i), device: device.serial,
    }, 9 + i);
  });
}

function spikeTickets(day: number): ChangeEvent[] {
  if (day < SPIKE_START || day > SPIKE_END) return [];
  const rng = rngFor(day, 2);
  const events: ChangeEvent[] = [];
  const make = (batch: string, count: number, tag: string) => {
    const pool = installedDevices(day, batch);
    for (let i = 0; i < count && pool.length > 0; i++) {
      const device = pool[Math.floor(rng() * pool.length)]!;
      const ticketNo = `ST-${day}-${tag}${i + 1}`;
      events.push(
        ev("tickets", ticketNo, day, {
          ticket_no: ticketNo, issue: "pump noise", status: "open", city: device.city,
          opened_at: dateOf(day, 11 + i), device: device.serial,
        }, 11 + i),
      );
    }
  };
  make("M2-0529", 3, "S");
  make("M2-0602", 1, "T");
  return events;
}

export function spikeTicketNos(uptoDay: number): string[] {
  const nos: string[] = [];
  for (let day = SPIKE_START; day <= Math.min(uptoDay, SPIKE_END); day++) {
    for (const event of spikeTickets(day)) {
      nos.push(String((event.payload as { ticket_no: string }).ticket_no));
    }
  }
  return nos;
}

// --- Incidents ------------------------------------------------------------

function incidents(day: number): ChangeEvent[] {
  const events: ChangeEvent[] = [];

  if (day === DELAY_EMAIL_DAY) {
    events.push(
      ev("email", "msg-delay-4472", day, {
        message_id: "msg-delay-4472",
        from: "dispatch@aquamotion.in",
        subject: "Re: PO-4472 — revised dispatch schedule",
        body:
          "Hello team,\n\nDue to a line changeover at our Pune plant, dispatch against PO-4472 " +
          "(pump lot P-88A continuation) will be delayed by 10 days. Partial shipment is not " +
          "confirmed at this stage. Revised ETA shared by Friday.\n\nRegards,\nAquaMotion Components",
        classification: "delay",
        supplier: "AquaMotion Components",
        po_number: "PO-4472",
        delay_days: 10,
        mentions: [
          { type: "Supplier", key: "AquaMotion Components" },
          { type: "PurchaseOrder", key: "PO-4472" },
        ],
      }),
    );
  }
  if (day === DELAY_EMAIL_DAY + 2) {
    events.push(
      ev("email", "msg-invoice-4471", day, {
        message_id: "msg-invoice-4471",
        from: "accounts@aquamotion.in",
        subject: "Invoice INV-2214 for PO-4471",
        body: "Please find attached invoice INV-2214 against PO-4471. Payment due in 30 days.",
        classification: "invoice",
        supplier: "AquaMotion Components",
        po_number: "PO-4471",
        mentions: [{ type: "PurchaseOrder", key: "PO-4471" }],
      }),
    );
  }

  if (day === CLUSTER_DAY) {
    const tickets = spikeTicketNos(day);
    events.push(
      ev("tickets", "cluster-pump-noise", day, {
        entity: "cluster",
        cluster_key: "CL-PUMP-NOISE",
        issue: "pump noise",
        count: tickets.length,
        window_days: 14,
        ratio: 3.2,
        tickets,
      }, 18),
    );
  }

  if (day === TELEMETRY_DAY) {
    const cohort = installedDevices(day, SPIKE_BATCH).slice(0, 10).map((d) => d.serial);
    events.push(
      ev("telemetry", "ta-pump-noise", day, {
        anomaly_key: "TA-PUMP-NOISE",
        metric: "pump acoustic level",
        magnitude: 3.2,
        window_days: 14,
        city: "Bengaluru",
        devices: cohort,
      }, 6),
    );
  }

  // Warranty claims trail the spike.
  if (day >= 62 && day <= 78 && (day - 62) % 4 === 0) {
    const pool = installedDevices(day, SPIKE_BATCH);
    const device = pool[(day * 7) % pool.length]!;
    const claimNo = `WC-${day}`;
    events.push(
      ev("erp", `claim-${claimNo}`, day, {
        entity: "warranty_claim", claim_no: claimNo, amount_inr: 4200,
        filed_at: dateOf(day), failure_mode: "pump failure", device: device.serial,
      }, 15),
    );
  }

  return events;
}

// --- Public API -----------------------------------------------------------

export function eventsForDay(day: number): ChangeEvent[] {
  return [
    ...CATALOG.filter((item) => item.day === day).map((item) => item.event),
    ...baselineTickets(day),
    ...spikeTickets(day),
    ...incidents(day),
  ];
}

export function allEvents(uptoDay = TIMELINE_DAYS): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  for (let day = 0; day <= uptoDay; day++) events.push(...eventsForDay(day));
  return events;
}
