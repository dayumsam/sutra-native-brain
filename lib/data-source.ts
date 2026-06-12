import { sql } from "drizzle-orm";
import type { InsightContent } from "@sutra/contracts";
import type { SubgraphNode } from "@sutra/graph";
import { WORKFLOWS, type Artifact, type Workflow } from "./demo-data";
import { getSpine } from "./spine";

// DATA_MODE switch: demo (default) serves the scripted dataset unchanged;
// graph maps real insights from Postgres into the same UI shapes, so the
// components don't change. Falls back to demo when the graph is empty or
// unreachable, so a fresh preview never renders a blank product.

// Real entity types → representative demo canvas nodes (the canvas itself
// still renders the scripted layout in phase 1; spotlighting stays meaningful).
const TYPE_TO_CANVAS_NODE: Record<string, string> = {
  Batch: "batch_0529",
  SupplierLot: "pump_lot_p88a",
  Supplier: "sup_aquamotion",
  PurchaseOrder: "po_4472",
  Device: "serial",
  ServiceTicket: "ticket_st1048",
  ComplaintCluster: "complaint_cluster",
  WarrantyClaim: "warranty_claims",
  Component: "comp_pump",
  TelemetryAnomaly: "telemetry",
};

const TRIGGER_LABELS: Record<string, { name: string; source: string }> = {
  "quality-spike": { name: "Quality signal (live)", source: "Threshold detector" },
  "supplier-delay": { name: "Supplier delay (live)", source: "Inbound email" },
  "lot-exposure": { name: "Lot exposure (live)", source: "Graph pattern" },
  "telemetry-drift": { name: "Telemetry drift (live)", source: "Telemetry anomaly" },
};

const ARTIFACT_KIND_LABELS: Record<string, Artifact["kind"]> = {
  email_draft: "Email draft",
  checklist: "Checklist",
  task: "Task",
  memo: "Memo",
};

type InsightRow = {
  id: string;
  content: InsightContent & { verifier?: { ok: boolean; notes: string } };
  trigger_key: string;
  signal_payload: Record<string, unknown>;
  subgraph_snapshot: { nodes: SubgraphNode[] } | null;
};

function toWorkflow(row: InsightRow): Workflow {
  const labels = TRIGGER_LABELS[row.trigger_key] ?? {
    name: row.trigger_key,
    source: "Signal",
  };
  const nodes = row.subgraph_snapshot?.nodes ?? [];
  return {
    id: row.id,
    name: labels.name,
    description: row.content.headline,
    triggerSource: labels.source,
    trigger: `Signal ${row.trigger_key}: ${JSON.stringify(row.signal_payload)}`,
    retrieval: nodes.slice(0, 12).map((node) => ({
      nodeId: TYPE_TO_CANVAS_NODE[node.type] ?? "prod_m2",
      record: `${node.type}/${node.key}`,
      detail: node.card_text,
    })),
    response: {
      headline: row.content.headline,
      narrative: row.content.narrative,
      facts: row.content.facts.map((fact, i) => [`Fact ${i + 1}`, fact.text]),
      recommendations: row.content.recommendations.map((rec) => ({
        action: rec.action,
        why: rec.why.map((w) => w.text),
      })),
      artifacts: row.content.artifacts.map((artifact, i) => ({
        id: `${row.id}-a${i}`,
        kind: ARTIFACT_KIND_LABELS[artifact.kind] ?? "Memo",
        title: artifact.title,
        meta: artifact.meta,
        lines: artifact.lines,
      })),
    },
  };
}

export async function getWorkflows(): Promise<{ workflows: Workflow[]; live: boolean }> {
  const spinePromise = getSpine();
  if (!spinePromise) return { workflows: WORKFLOWS, live: false };

  try {
    const spine = await spinePromise;
    const result = await spine.db.execute(sql`
      SELECT i.id, i.content, s.trigger_key, s.payload AS signal_payload,
             r.subgraph_snapshot
      FROM insights i
      JOIN signals s ON s.id = i.signal_id
      LEFT JOIN agent_runs r ON r.id = i.agent_run_id
      WHERE i.tenant_id = ${spine.tenantId} AND i.status != 'superseded'
      ORDER BY i.created_at DESC
      LIMIT 12
    `);
    const rows = result.rows as InsightRow[];
    if (rows.length === 0) return { workflows: WORKFLOWS, live: false };
    return { workflows: rows.map(toWorkflow), live: true };
  } catch (error) {
    console.error("data-source: graph unavailable, falling back to demo", error);
    return { workflows: WORKFLOWS, live: false };
  }
}
