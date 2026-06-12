import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { buildRegistry } from "@sutra/customer-demo";
import { FakeEmbedder, GraphStore, migrate, PgEventBus, type Db } from "@sutra/graph";
import { eventsForDay, SPIKE_BATCH, SPIKE_LOT } from "@sutra/ingestion";
import { tick, type EngineDeps } from "../src/index";

let deps: EngineDeps;
let db: Db;
let signalsAtDay54 = -1;

beforeAll(async () => {
  const client = new PGlite({ extensions: { vector } });
  db = drizzle(client) as unknown as Db;
  await migrate(db);
  deps = {
    db,
    store: new GraphStore(db, new FakeEmbedder()),
    bus: new PgEventBus(db),
    registry: buildRegistry(),
  };

  // Replay the timeline chronologically with a tick per day — the cron
  // cadence the production dispatcher runs at, in miniature.
  for (let day = 0; day <= 70; day++) {
    await deps.bus.publish(eventsForDay(day));
    await tick(deps);
    if (day === 54) {
      const n = await db.execute(sql`SELECT count(*)::int AS n FROM signals`);
      signalsAtDay54 = (n.rows[0] as { n: number }).n;
    }
  }
}, 240_000);

async function signalsFor(triggerKey: string) {
  const result = await db.execute(
    sql`SELECT * FROM signals WHERE trigger_key = ${triggerKey} ORDER BY created_at`,
  );
  return result.rows as Array<{
    id: string;
    entity_id: string | null;
    payload: Record<string, unknown>;
    dedupe_key: string;
  }>;
}

describe("detect stage over the synthetic timeline", () => {
  it("stays silent before the scripted incidents", () => {
    expect(signalsAtDay54).toBe(0);
  });

  it("quality-spike fires exactly once, on the scripted batch", async () => {
    const signals = await signalsFor("quality-spike");
    expect(signals).toHaveLength(1);
    expect(signals[0]!.payload).toMatchObject({ batch_code: SPIKE_BATCH });
    const batch = await db.execute(
      sql`SELECT key FROM entities WHERE id = ${signals[0]!.entity_id}`,
    );
    expect((batch.rows[0] as { key: string }).key).toBe(SPIKE_BATCH);
  });

  it("supplier-delay fires once from the classified email", async () => {
    const signals = await signalsFor("supplier-delay");
    expect(signals).toHaveLength(1);
    expect(signals[0]!.payload).toMatchObject({ po_number: "PO-4472", delay_days: 10 });
    expect(signals[0]!.entity_id).not.toBeNull();
  });

  it("lot-exposure fires once on the shared lot with open POs", async () => {
    const signals = await signalsFor("lot-exposure");
    expect(signals).toHaveLength(1);
    expect(signals[0]!.payload).toMatchObject({ lot_code: SPIKE_LOT });
    expect(Number(signals[0]!.payload.open_pos)).toBeGreaterThanOrEqual(1);
  });

  it("telemetry-drift fires once from the anomaly entity", async () => {
    const signals = await signalsFor("telemetry-drift");
    expect(signals).toHaveLength(1);
    expect(signals[0]!.payload).toMatchObject({ anomaly_key: "TA-PUMP-NOISE" });
  });

  it("creates no other signals and one pending agent run per signal", async () => {
    const total = await db.execute(sql`SELECT count(*)::int AS n FROM signals`);
    expect((total.rows[0] as { n: number }).n).toBe(4);
    const runs = await db.execute(
      sql`SELECT count(*)::int AS n FROM agent_runs WHERE status = 'pending'`,
    );
    expect((runs.rows[0] as { n: number }).n).toBe(4);
  });

  it("an extra tick with no events stays a no-op", async () => {
    const result = await tick(deps);
    expect(result.processed).toBe(0);
    expect(result.newSignalIds).toEqual([]);
  });
});
