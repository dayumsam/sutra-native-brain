import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "@sutra/customer-demo";
import { FakeEmbedder, GraphStore, migrate, PgEventBus, type Db } from "@sutra/graph";
import { eventsForDay, SPIKE_BATCH, SPIKE_LOT } from "@sutra/ingestion";
import { executePendingRuns, tick, type RunDeps, type Synthesizer, type Verifier } from "../src/index";

class EchoSynthesizer implements Synthesizer {
  async synthesize({ prompt }: { system: string; prompt: string }) {
    const ids = [...prompt.matchAll(/\[([0-9a-f-]{36})\]/g)].map((m) => m[1]!);
    return {
      content: {
        headline: "e2e insight",
        narrative: "n",
        facts: [{ text: "f", citations: [ids[0]!] }],
        recommendations: [],
        artifacts: [],
      },
      tokensIn: 1,
      tokensOut: 1,
    };
  }
}
class OkVerifier implements Verifier {
  async verify() {
    return { ok: true, notes: "", tokensIn: 1, tokensOut: 1 };
  }
}

// The spec's §10 integration test: full timeline through the real pipeline,
// then assert the quality-spike investigation surfaced the complete
// batch → lot → supplier → open-PO chain the demo narrates.
describe("end-to-end timeline replay", () => {
  it("traces the spike to the lot, supplier, and open PO in one run", async () => {
    const client = new PGlite({ extensions: { vector } });
    const db = drizzle(client) as unknown as Db;
    await migrate(db);
    const embedder = new FakeEmbedder();
    const deps: RunDeps = {
      db,
      store: new GraphStore(db, embedder),
      bus: new PgEventBus(db),
      registry: buildRegistry(),
      embedder,
      synthesizer: new EchoSynthesizer(),
      verifier: new OkVerifier(),
    };

    for (let day = 0; day <= 70; day++) {
      await deps.bus.publish(eventsForDay(day));
      await tick(deps);
    }
    await executePendingRuns(deps);

    const run = await db.execute(sql`
      SELECT r.subgraph_snapshot FROM agent_runs r
      JOIN signals s ON s.id = r.signal_id
      WHERE s.trigger_key = 'quality-spike' AND r.status = 'completed'
    `);
    expect(run.rows).toHaveLength(1);
    const snapshot = (run.rows[0] as { subgraph_snapshot: { nodes: Array<{ type: string; key: string }> } })
      .subgraph_snapshot;
    const keys = new Set(snapshot.nodes.map((n) => `${n.type}/${n.key}`));

    expect(keys.has(`Batch/${SPIKE_BATCH}`)).toBe(true);
    expect(keys.has(`SupplierLot/${SPIKE_LOT}`)).toBe(true);
    expect(keys.has("Supplier/AquaMotion Components")).toBe(true);
    expect(keys.has("PurchaseOrder/PO-4472")).toBe(true);

    // And the delivered insight's citation resolves.
    const insight = await db.execute(sql`
      SELECT i.content FROM insights i JOIN signals s ON s.id = i.signal_id
      WHERE s.trigger_key = 'quality-spike'
    `);
    const citation = (insight.rows[0] as { content: { facts: Array<{ citations: string[] }> } })
      .content.facts[0]!.citations[0]!;
    const resolved = await db.execute(sql`
      SELECT 1 FROM entities WHERE id = ${citation}
      UNION SELECT 1 FROM documents WHERE id = ${citation}
    `);
    expect(resolved.rows).toHaveLength(1);
  }, 240_000);
});
