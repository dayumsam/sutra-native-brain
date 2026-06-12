import type { ChangeEvent } from "@sutra/contracts";

// Raw artifacts: what the synthetic data looks like when it pretends to be
// real source-system exports sitting in object storage. Renderers produce the
// messy shapes (SAP-ish ERP rows, Zendesk tickets, RFC-822 emails, analytics
// exports); parsers do what a real connector must — translate them back into
// ChangeEvents, including keyword classification and reference extraction.
//
// Raw sources get their own names (sap-erp, zendesk, mail, analytics) and
// their own ontology mappings, proving the canonical layer is reachable from
// differently-shaped sources.

export type RawArtifact = {
  key: string; // raw/{tenant}/{source}/day={NN}/{source_id}.{ext}
  contentType: string;
  body: string;
};

const day2 = (day: number) => String(day).padStart(2, "0");
const sapDate = (iso: string | undefined) => (iso ? iso.slice(0, 10).replaceAll("-", "") : "");

function dayOf(event: ChangeEvent): number {
  const T0 = Date.UTC(2026, 2, 1);
  return Math.floor((Date.parse(event.observed_at) - T0) / 86_400_000);
}

// --- ERP (SAP-flavored) ----------------------------------------------------

const SAP_RECORD_TYPES: Record<string, string> = {
  supplier: "LFA1",
  component: "MARA",
  lot: "MCHA",
  batch: "AFKO",
  po: "EKKO",
  device: "EQUI",
  warranty_claim: "QMEL",
};

function renderErp(event: ChangeEvent, day: number): RawArtifact {
  const p = event.payload as Record<string, unknown>;
  const entity = String(p.entity);
  const rec: Record<string, unknown> = { RECORD_TYPE: SAP_RECORD_TYPES[entity] ?? "UNKNOWN" };
  switch (entity) {
    case "supplier":
      Object.assign(rec, { NAME1: p.name, ORT01: p.location, ZZRATING: p.rating });
      break;
    case "component":
      Object.assign(rec, { MATNR: p.part_no, MAKTX: p.name, MTART: p.category });
      break;
    case "lot":
      Object.assign(rec, {
        CHARG: p.lot_code, MATNR: p.component, LIFNR_NAME: p.supplier,
        BUDAT: sapDate(p.received_at as string),
      });
      break;
    case "batch":
      Object.assign(rec, {
        CHARG: p.batch_code, MATNR_FERT: p.product_model,
        HSDAT: sapDate(p.produced_at as string), GAMNG: p.units, ZZPUMP_CHARG: p.lot,
      });
      break;
    case "po":
      Object.assign(rec, {
        EBELN: p.po_number,
        STATU: p.status === "open" ? "O" : p.status === "closed" ? "C" : "X",
        MATNR: p.component, CHARG: p.lot, MENGE: p.qty, EINDT: sapDate(p.due_date as string),
      });
      break;
    case "device":
      Object.assign(rec, {
        SERNR: p.serial, MATNR: p.model, ZZINSTALL: sapDate(p.installed_at as string),
        ZZCITY: p.city, CHARG: p.batch,
      });
      break;
    case "warranty_claim":
      Object.assign(rec, {
        QMNUM: p.claim_no, DMBTR: p.amount_inr, BUDAT: sapDate(p.filed_at as string),
        ZZFAILURE: p.failure_mode, SERNR: p.device,
      });
      break;
  }
  return {
    key: `raw/${event.tenant_id}/sap-erp/day=${day2(day)}/${event.source_id}.json`,
    contentType: "application/json",
    body: JSON.stringify(rec, null, 1),
  };
}

const fromSap = (d: unknown) =>
  d ? `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}` : undefined;

export function parseErp(body: string): Record<string, unknown> {
  const rec = JSON.parse(body) as Record<string, unknown>;
  switch (rec.RECORD_TYPE) {
    case "LFA1":
      return { entity: "supplier", name: rec.NAME1, location: rec.ORT01, rating: rec.ZZRATING };
    case "MARA":
      return { entity: "component", part_no: rec.MATNR, name: rec.MAKTX, category: rec.MTART };
    case "MCHA":
      return {
        entity: "lot", lot_code: rec.CHARG, component: rec.MATNR,
        supplier: rec.LIFNR_NAME, received_at: fromSap(rec.BUDAT),
      };
    case "AFKO":
      return {
        entity: "batch", batch_code: rec.CHARG, product_model: rec.MATNR_FERT,
        produced_at: fromSap(rec.HSDAT), units: rec.GAMNG, lot: rec.ZZPUMP_CHARG,
      };
    case "EKKO":
      return {
        entity: "po", po_number: rec.EBELN,
        status: rec.STATU === "O" ? "open" : rec.STATU === "C" ? "closed" : "cancelled",
        component: rec.MATNR, lot: rec.CHARG, qty: rec.MENGE, due_date: fromSap(rec.EINDT),
      };
    case "EQUI":
      return {
        entity: "device", serial: rec.SERNR, model: rec.MATNR,
        installed_at: fromSap(rec.ZZINSTALL), city: rec.ZZCITY, batch: rec.CHARG,
      };
    case "QMEL":
      return {
        entity: "warranty_claim", claim_no: rec.QMNUM, amount_inr: rec.DMBTR,
        filed_at: fromSap(rec.BUDAT), failure_mode: rec.ZZFAILURE, device: rec.SERNR,
      };
    default:
      throw new Error(`Unknown SAP RECORD_TYPE ${String(rec.RECORD_TYPE)}`);
  }
}

// --- Tickets (Zendesk-flavored) ---------------------------------------------

function renderTicket(event: ChangeEvent, day: number): RawArtifact {
  const p = event.payload as Record<string, unknown>;
  if (p.entity === "cluster") {
    // Derived analytics export, not a Zendesk object.
    return {
      key: `raw/${event.tenant_id}/analytics/day=${day2(day)}/${event.source_id}.json`,
      contentType: "application/json",
      body: JSON.stringify({
        export: "complaint_cluster",
        cluster_key: p.cluster_key, issue: p.issue, ticket_count: p.count,
        window_days: p.window_days, ratio_vs_baseline: p.ratio, ticket_refs: p.tickets,
      }, null, 1),
    };
  }
  return {
    key: `raw/${event.tenant_id}/zendesk/day=${day2(day)}/${event.source_id}.json`,
    contentType: "application/json",
    body: JSON.stringify({
      url: `https://native.zendesk.com/api/v2/tickets/${String(p.ticket_no).replace(/\D/g, "")}.json`,
      external_id: p.ticket_no,
      subject: p.issue,
      status: p.status,
      created_at: p.opened_at,
      tags: [p.city, "purifier"].filter(Boolean),
      custom_fields: [{ id: 90001, name: "device_serial", value: p.device }],
    }, null, 1),
  };
}

export function parseZendesk(body: string): Record<string, unknown> {
  const t = JSON.parse(body) as Record<string, unknown>;
  const fields = (t.custom_fields as Array<{ name: string; value: unknown }>) ?? [];
  return {
    ticket_no: t.external_id,
    issue: t.subject,
    status: t.status,
    city: (t.tags as string[] | undefined)?.[0],
    opened_at: t.created_at,
    device: fields.find((f) => f.name === "device_serial")?.value,
  };
}

export function parseAnalytics(body: string): Record<string, unknown> {
  const a = JSON.parse(body) as Record<string, unknown>;
  if (a.export === "complaint_cluster") {
    return {
      entity: "cluster", cluster_key: a.cluster_key, issue: a.issue,
      count: a.ticket_count, window_days: a.window_days, ratio: a.ratio_vs_baseline,
      tickets: a.ticket_refs,
    };
  }
  // telemetry anomaly export
  return {
    anomaly_key: a.anomaly_key, metric: a.metric, magnitude: a.magnitude,
    window_days: a.window_days, city: a.city, devices: a.device_serials,
  };
}

// --- Email (RFC-822) ---------------------------------------------------------

function renderEmail(event: ChangeEvent, day: number): RawArtifact {
  const p = event.payload as Record<string, unknown>;
  const fromName = String(p.supplier ?? "Unknown Sender");
  const eml = [
    `Message-ID: <${p.message_id}@mail.native.com>`,
    `From: ${fromName} <${String(p.from)}>`,
    `To: ops@native.com`,
    `Date: ${new Date(event.observed_at).toUTCString()}`,
    `Subject: ${p.subject}`,
    ``,
    String(p.body ?? ""),
  ].join("\r\n");
  return {
    key: `raw/${event.tenant_id}/mail/day=${day2(day)}/${event.source_id}.eml`,
    contentType: "message/rfc822",
    body: eml,
  };
}

// A real connector has no `classification` field — derive it the way phase-1
// triage would: keywords. Likewise PO references and delay durations are
// extracted from the text.
export function parseEml(body: string): Record<string, unknown> {
  const sep = body.indexOf("\r\n\r\n");
  const rawHeaders = sep === -1 ? body : body.slice(0, sep);
  const text = sep === -1 ? "" : body.slice(sep + 4);
  const headers = new Map<string, string>();
  for (const line of rawHeaders.split("\r\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) headers.set(line.slice(0, idx).toLowerCase(), line.slice(idx + 1).trim());
  }
  const from = headers.get("from") ?? "";
  const fromMatch = /^(.*?)\s*<(.+)>$/.exec(from);
  const subject = headers.get("subject") ?? "";
  const haystack = `${subject}\n${text}`.toLowerCase();

  const classification = /delay|revised dispatch|pushed back/.test(haystack)
    ? "delay"
    : /invoice|payment due/.test(haystack)
      ? "invoice"
      : "other";
  const poRef = /\b(PO-\d+)\b/.exec(`${subject}\n${text}`)?.[1];
  const delayDays = /delayed by (\d+) days?/i.exec(text)?.[1];

  return {
    message_id: (headers.get("message-id") ?? "").replace(/[<>]/g, "").split("@")[0],
    from: fromMatch?.[2] ?? from,
    supplier: fromMatch?.[1] || undefined,
    subject,
    body: text,
    classification,
    po_number: poRef,
    delay_days: delayDays ? Number(delayDays) : undefined,
    mentions: poRef ? [{ type: "PurchaseOrder", key: poRef }] : [],
  };
}

// --- Telemetry (analytics export) ---------------------------------------------

function renderTelemetry(event: ChangeEvent, day: number): RawArtifact {
  const p = event.payload as Record<string, unknown>;
  return {
    key: `raw/${event.tenant_id}/analytics/day=${day2(day)}/${event.source_id}.json`,
    contentType: "application/json",
    body: JSON.stringify({
      export: "anomaly_detection",
      anomaly_key: p.anomaly_key, metric: p.metric, magnitude: p.magnitude,
      window_days: p.window_days, city: p.city, device_serials: p.devices,
    }, null, 1),
  };
}

// --- Top level -----------------------------------------------------------------

/** Timeline event → raw artifact, keyed by source system. */
export function renderRawArtifact(event: ChangeEvent): RawArtifact {
  const day = dayOf(event);
  switch (event.source) {
    case "erp":
      return renderErp(event, day);
    case "tickets":
      return renderTicket(event, day);
    case "email":
      return renderEmail(event, day);
    case "telemetry":
      return renderTelemetry(event, day);
    default:
      throw new Error(`No raw renderer for source "${event.source}"`);
  }
}

/** Raw source name (from the key path) → parsed ChangeEvent payload. */
export function parseRawArtifact(rawSource: string, body: string): Record<string, unknown> {
  switch (rawSource) {
    case "sap-erp":
      return parseErp(body);
    case "zendesk":
      return parseZendesk(body);
    case "mail":
      return parseEml(body);
    case "analytics":
      return parseAnalytics(body);
    default:
      throw new Error(`No parser for raw source "${rawSource}"`);
  }
}

export function parseRawKey(key: string): {
  tenantId: string;
  rawSource: string;
  day: number;
  sourceId: string;
} {
  const match = /^raw\/([^/]+)\/([^/]+)\/day=(\d+)\/(.+)\.\w+$/.exec(key);
  if (!match) throw new Error(`Unparseable raw key: ${key}`);
  return {
    tenantId: match[1]!,
    rawSource: match[2]!,
    day: Number(match[3]),
    sourceId: match[4]!,
  };
}
