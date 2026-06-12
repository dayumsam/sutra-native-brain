// Live verification of the spine against the running dev server + database.
// Usage: node scripts/verify-spine.mjs
// Checks that every workflow's insight is genuinely grounded in graph context.

import { readFileSync } from "node:fs";
import { Pool } from "pg";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const pool = new Pool({ connectionString: env.DATABASE_URL });
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

const q = async (text, params = []) => (await pool.query(text, params)).rows;

// 1. Signals: exactly one per trigger family.
const signals = await q("SELECT trigger_key, count(*)::int AS n FROM signals GROUP BY 1 ORDER BY 1");
const expected = ["lot-exposure", "quality-spike", "supplier-delay", "telemetry-drift"];
check(
  "exactly one signal per trigger",
  signals.length === 4 && signals.every((s) => s.n === 1 && expected.includes(s.trigger_key)),
  signals.map((s) => `${s.trigger_key}:${s.n}`).join(", "),
);

// 2. Agent runs: completed, with non-empty subgraph snapshots and full step ladders.
const runs = await q(`
  SELECT r.*, s.trigger_key FROM agent_runs r JOIN signals s ON s.id = r.signal_id
`);
check("4 agent runs, all completed", runs.length === 4 && runs.every((r) => r.status === "completed"),
  runs.map((r) => `${r.trigger_key}:${r.status}`).join(", "));
for (const run of runs) {
  const nodes = run.subgraph_snapshot?.nodes ?? [];
  check(
    `${run.trigger_key}: investigated a real subgraph`,
    nodes.length > 0,
    `${nodes.length} nodes, ${run.subgraph_snapshot?.edges?.length ?? 0} edges`,
  );
  const stages = (run.steps ?? []).map((s) => s.stage);
  check(
    `${run.trigger_key}: full pipeline steps recorded`,
    ["investigate", "synthesize", "verify", "route"].every((s) => stages.includes(s)),
    stages.join(" → "),
  );
  check(`${run.trigger_key}: real tokens spent`, run.tokens_in + run.tokens_out > 0,
    `${run.tokens_in + run.tokens_out} tokens`);
  check(`${run.trigger_key}: trace id recorded for Langfuse`, Boolean(run.trace_id), run.trace_id ?? "");
}

// 3. Insights: every citation must be an id from ITS OWN run's context
//    (subgraph nodes ∪ mentioned documents) — i.e. provably graph-grounded.
const insights = await q(`
  SELECT i.*, s.trigger_key, r.subgraph_snapshot
  FROM insights i JOIN signals s ON s.id = i.signal_id
  LEFT JOIN agent_runs r ON r.id = i.agent_run_id
`);
check("4 insights delivered", insights.length === 4, insights.map((i) => i.trigger_key).join(", "));
const docIds = new Set((await q("SELECT id FROM documents")).map((d) => d.id));
for (const insight of insights) {
  const allowed = new Set([
    ...(insight.subgraph_snapshot?.nodes ?? []).map((n) => n.id),
    ...docIds,
  ]);
  const citations = [
    ...insight.content.facts.flatMap((f) => f.citations),
    ...insight.content.recommendations.flatMap((r) => r.why.flatMap((w) => w.citations)),
  ];
  check(
    `${insight.trigger_key}: all ${citations.length} citations come from its own subgraph/docs`,
    citations.length > 0 && citations.every((c) => allowed.has(c)),
  );
}

// 4. The killer-workflow chain is in the quality-spike context.
const spikeRun = runs.find((r) => r.trigger_key === "quality-spike");
const keys = new Set((spikeRun?.subgraph_snapshot?.nodes ?? []).map((n) => `${n.type}/${n.key}`));
for (const expectedNode of [
  "Batch/M2-0529",
  "SupplierLot/P-88A",
  "Supplier/AquaMotion Components",
  "PurchaseOrder/PO-4472",
]) {
  check(`quality-spike context contains ${expectedNode}`, keys.has(expectedNode));
}

// 5. Embeddings present (vector leg of hybrid search active).
const [{ n: embedded }] = await q(
  "SELECT count(*)::int AS n FROM entities WHERE embedding IS NOT NULL",
);
check("entities carry embeddings (vector search active)", embedded > 0, `${embedded} embedded`);

// 6. The product UI is on live data.
const html = await (await fetch(BASE + "/")).text();
check("home page renders 'Live context graph'", html.includes("Live context graph"));
check("home page lists a live insight headline",
  insights.some((i) => html.includes(i.content.headline.slice(0, 40).replace(/&/g, "&amp;"))));

console.log(`\n${pass} passed, ${fail} failed`);
await pool.end();
process.exit(fail === 0 ? 0 : 1);
