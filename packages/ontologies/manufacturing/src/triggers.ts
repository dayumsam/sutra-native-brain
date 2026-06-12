import { defineTrigger } from "@sutra/ontology-core";

// All detector SQL is timeline-relative (windows anchor on max(opened_at) in
// the data, not now()), so replaying historical synthetic timelines fires
// identically — the core test loop of the spec.

/**
 * Threshold detector: tickets-per-batch in the trailing 7 days vs the weekly
 * average of the prior 28 days. Fires at ≥3× with at least 10 recent tickets
 * (SPC-style ratio rule — plain statistics before any ML).
 */
export const qualitySpike = defineTrigger("quality-spike", {
  kind: "threshold",
  severity: "critical",
  sql: `
    WITH t AS (
      SELECT e.id, (e.properties->>'opened_at')::timestamptz AS opened_at
      FROM entities e
      WHERE e.tenant_id = $1 AND e.type = 'ServiceTicket' AND e.deleted_at IS NULL
    ),
    latest AS (SELECT max(opened_at) AS t1 FROM t),
    ticket_batch AS (
      SELECT b.id AS batch_id, b.key AS batch_code, t.opened_at
      FROM t
      JOIN edges ab ON ab.tenant_id = $1 AND ab.type = 'ABOUT' AND ab.src = t.id
      JOIN edges bi ON bi.tenant_id = $1 AND bi.type = 'BUILT_IN' AND bi.src = ab.dst
      JOIN entities b ON b.id = bi.dst AND b.deleted_at IS NULL
    )
    SELECT batch_id AS entity_id,
      jsonb_build_object(
        'batch_code', batch_code,
        'recent_7d', count(*) FILTER (WHERE opened_at > t1 - interval '7 days'),
        'baseline_weekly',
          round((count(*) FILTER (WHERE opened_at <= t1 - interval '7 days'
                                    AND opened_at > t1 - interval '35 days'))::numeric / 4, 2)
      ) AS payload
    FROM ticket_batch, latest
    GROUP BY batch_id, batch_code, t1
    HAVING count(*) FILTER (WHERE opened_at > t1 - interval '7 days') >= 10
       AND count(*) FILTER (WHERE opened_at > t1 - interval '7 days')
           >= 3 * greatest(
             (count(*) FILTER (WHERE opened_at <= t1 - interval '7 days'
                                 AND opened_at > t1 - interval '35 days'))::numeric / 4, 1)
  `,
  dedupeKey: (d) => `quality-spike:${(d.payload as { batch_code?: string }).batch_code}`,
  traversal: "quality-trace",
  audience: "tenant",
});

/** Event detector: an inbound email classified as a delivery delay. */
export const supplierDelay = defineTrigger("supplier-delay", {
  kind: "event",
  severity: "warn",
  match: (event) => {
    if (event.source !== "email") return null;
    const p = event.payload as {
      classification?: string;
      supplier?: string;
      po_number?: string;
      delay_days?: number;
      subject?: string;
    };
    if (p.classification !== "delay" || !p.supplier) return null;
    return {
      entityRef: { type: "Supplier", key: p.supplier },
      payload: {
        supplier: p.supplier,
        po_number: p.po_number,
        delay_days: p.delay_days,
        subject: p.subject,
      },
    };
  },
  dedupeKey: (d) => `supplier-delay:${(d.payload as { po_number?: string }).po_number}`,
  traversal: "supplier-trace",
  audience: "tenant",
});

/**
 * Graph-pattern detector (the highest-value kind): a complaint cluster whose
 * devices trace to a supplier lot that still has open purchase orders.
 */
export const lotExposure = defineTrigger("lot-exposure", {
  kind: "graph-pattern",
  severity: "critical",
  sql: `
    SELECT lot.id AS entity_id,
      jsonb_build_object(
        'lot_code', lot.key,
        'cluster_key', c.key,
        'issue', c.properties->>'issue',
        'open_pos', count(DISTINCT po.id),
        'affected_devices', count(DISTINCT ab.dst)
      ) AS payload
    FROM entities c
    JOIN edges cl ON cl.tenant_id = $1 AND cl.type = 'CLUSTERS' AND cl.src = c.id
    JOIN edges ab ON ab.tenant_id = $1 AND ab.type = 'ABOUT' AND ab.src = cl.dst
    JOIN edges bi ON bi.tenant_id = $1 AND bi.type = 'BUILT_IN' AND bi.src = ab.dst
    JOIN edges ul ON ul.tenant_id = $1 AND ul.type = 'USES_LOT' AND ul.src = bi.dst
    JOIN entities lot ON lot.id = ul.dst AND lot.deleted_at IS NULL
    JOIN edges fl ON fl.tenant_id = $1 AND fl.type = 'FOR_LOT' AND fl.dst = lot.id
    JOIN entities po ON po.id = fl.src AND po.properties->>'status' = 'open'
      AND po.deleted_at IS NULL
    WHERE c.tenant_id = $1 AND c.type = 'ComplaintCluster' AND c.deleted_at IS NULL
    GROUP BY lot.id, lot.key, c.key, c.properties->>'issue'
  `,
  dedupeKey: (d) => `lot-exposure:${(d.payload as { lot_code?: string }).lot_code}`,
  traversal: "lot-trace",
  audience: "tenant",
});

/** Event detector: a pre-derived telemetry anomaly entity arriving from the TSDB side. */
export const telemetryDrift = defineTrigger("telemetry-drift", {
  kind: "event",
  severity: "warn",
  match: (event) => {
    if (event.source !== "telemetry") return null;
    const p = event.payload as {
      anomaly_key?: string;
      metric?: string;
      magnitude?: number;
    };
    if (!p.anomaly_key) return null;
    return {
      entityRef: { type: "TelemetryAnomaly", key: p.anomaly_key },
      payload: { anomaly_key: p.anomaly_key, metric: p.metric, magnitude: p.magnitude },
    };
  },
  dedupeKey: (d) => `telemetry-drift:${(d.payload as { anomaly_key?: string }).anomaly_key}`,
  traversal: "device-trace",
  audience: "tenant",
});

export const TRIGGERS = [qualitySpike, supplierDelay, lotExposure, telemetryDrift];
