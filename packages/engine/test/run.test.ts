import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { buildRegistry } from "@sutra/customer-demo";
import { FakeEmbedder, GraphStore, migrate, PgEventBus, type Db } from "@sutra/graph";
import { eventsForDay } from "@sutra/ingestion";
import {
  checkCitations,
  executeAgentRun,
  executePendingRuns,
  tick,
  type RunDeps,
  type Synthesizer,
  type Verifier,
} from "../src/index";

// Cites the first three bracketed ids it finds in the prompt — always valid.
class GoodFakeSynthesizer implements Synthesizer {
  calls = 0;
  async synthesize({ prompt }: { system: string; prompt: string }) {
    this.calls++;
    const ids = [...prompt.matchAll(/\[([0-9a-f-]{36})\]/g)].map((m) => m[1]!);
    const cite = (n: number) => [ids[n % ids.length] ?? ids[0]!];
    return {
      content: {
        headline: "Complaint spike traces to one supplier lot.",
        narrative: "Synthetic narrative grounded in the provided subgraph.",
        facts: [
          { text: "Affected batch identified.", citations: cite(0) },
          { text: "Shared supplier lot identified.", citations: cite(1) },
        ],
        recommendations: [
          {
            action: "Quarantine the lot and hold open POs.",
            why: [{ text: "Open PO continues exposure.", citations: cite(2) }],
          },
        ],
        artifacts: [],
      },
      tokensIn: 1000,
      tokensOut: 300,
    };
  }
}

class BadFakeSynthesizer implements Synthesizer {
  calls = 0;
  async synthesize() {
    this.calls++;
    return {
      content: {
        headline: "Bad",
        narrative: "Cites a fabricated id.",
        facts: [{ text: "Made up.", citations: ["00000000-0000-0000-0000-000000000000"] }],
        recommendations: [],
        artifacts: [],
      },
      tokensIn: 10,
      tokensOut: 10,
    };
  }
}

class FakeVerifier implements Verifier {
  calls = 0;
  async verify() {
    this.calls++;
    return { ok: true, notes: "checks out", tokensIn: 50, tokensOut: 20 };
  }
}

let db: Db;
let baseDeps: Omit<RunDeps, "synthesizer" | "verifier">;

beforeAll(async () => {
  const client = new PGlite({ extensions: { vector } });
  db = drizzle(client) as unknown as Db;
  await migrate(db);
  const embedder = new FakeEmbedder();
  baseDeps = {
    db,
    store: new GraphStore(db, embedder),
    bus: new PgEventBus(db),
    registry: buildRegistry(),
    embedder,
  };
  for (let day = 0; day <= 70; day++) {
    await baseDeps.bus.publish(eventsForDay(day));
    await tick(baseDeps);
  }
}, 240_000);

describe("checkCitations", () => {
  it("rejects citations outside the citable set", () => {
    const result = checkCitations(
      {
        headline: "h",
        narrative: "n",
        facts: [{ text: "f", citations: ["nope"] }],
        recommendations: [],
        artifacts: [],
      },
      [{ id: "yes" }],
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.problems[0]).toContain("nope");
  });
});

describe("executeAgentRun end to end", () => {
  it("completes runs, snapshots the subgraph, and routes cited insights", async () => {
    const synthesizer = new GoodFakeSynthesizer();
    const verifier = new FakeVerifier();
    const outcomes = await executePendingRuns({ ...baseDeps, synthesizer, verifier });

    expect(Object.values(outcomes)).toEqual(["completed", "completed", "completed", "completed"]);
    expect(verifier.calls).toBe(4);

    const insights = await db.execute(sql`SELECT * FROM insights`);
    expect(insights.rows).toHaveLength(4);

    // Citations in stored insights resolve to real graph/document ids.
    for (const row of insights.rows) {
      const content = (row as { content: { facts: Array<{ citations: string[] }> } }).content;
      for (const fact of content.facts) {
        for (const citation of fact.citations) {
          const hit = await db.execute(sql`
            SELECT 1 FROM entities WHERE id = ${citation}
            UNION SELECT 1 FROM documents WHERE id = ${citation}
          `);
          expect(hit.rows.length).toBe(1);
        }
      }
    }

    const runs = await db.execute(
      sql`SELECT * FROM agent_runs WHERE status = 'completed'`,
    );
    expect(runs.rows).toHaveLength(4);
    for (const row of runs.rows) {
      const run = row as {
        subgraph_snapshot: { nodes: unknown[] } | null;
        tokens_in: number;
        steps: Array<{ stage: string }>;
      };
      expect(run.subgraph_snapshot?.nodes.length).toBeGreaterThan(0);
      expect(run.tokens_in).toBeGreaterThan(0);
      expect(run.steps.map((s) => s.stage)).toEqual([
        "investigate",
        "synthesize",
        "verify",
        "route",
      ]);
    }
  }, 120_000);

  it("retries once on bad citations, then degrades and withholds the insight", async () => {
    // Forge a fresh signal + run so pending state exists.
    const signal = await db.execute(sql`
      INSERT INTO signals (tenant_id, trigger_key, entity_id, severity, payload, dedupe_key)
      SELECT tenant_id, trigger_key, entity_id, severity, payload, 'forged:degrade-test'
      FROM signals LIMIT 1 RETURNING id, tenant_id
    `);
    const { id: signalId, tenant_id } = signal.rows[0] as { id: string; tenant_id: string };
    const run = await db.execute(sql`
      INSERT INTO agent_runs (tenant_id, signal_id, status)
      VALUES (${tenant_id}, ${signalId}, 'pending') RETURNING id
    `);
    const runId = (run.rows[0] as { id: string }).id;

    const synthesizer = new BadFakeSynthesizer();
    const verifier = new FakeVerifier();
    const status = await executeAgentRun({ ...baseDeps, synthesizer, verifier }, runId);

    expect(status).toBe("degraded");
    expect(synthesizer.calls).toBe(2); // one retry
    expect(verifier.calls).toBe(0); // never reached
    const insight = await db.execute(
      sql`SELECT 1 FROM insights WHERE signal_id = ${signalId}`,
    );
    expect(insight.rows).toHaveLength(0); // withheld
  }, 120_000);

  it("does not duplicate insights for an already-routed signal", async () => {
    const existing = await db.execute(sql`
      SELECT signal_id, tenant_id FROM insights LIMIT 1
    `);
    const { signal_id, tenant_id } = existing.rows[0] as { signal_id: string; tenant_id: string };
    const run = await db.execute(sql`
      INSERT INTO agent_runs (tenant_id, signal_id, status)
      VALUES (${tenant_id}, ${signal_id}, 'pending') RETURNING id
    `);
    const runId = (run.rows[0] as { id: string }).id;

    const status = await executeAgentRun(
      { ...baseDeps, synthesizer: new GoodFakeSynthesizer(), verifier: new FakeVerifier() },
      runId,
    );
    expect(status).toBe("completed");
    const insights = await db.execute(
      sql`SELECT count(*)::int AS n FROM insights WHERE signal_id = ${signal_id}`,
    );
    expect((insights.rows[0] as { n: number }).n).toBe(1);
  }, 120_000);
});
