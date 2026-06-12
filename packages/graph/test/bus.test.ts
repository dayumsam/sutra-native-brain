import { beforeAll, describe, expect, it } from "vitest";
import { PgEventBus } from "../src/index";
import type { Db } from "../src/index";
import { makeTestDb } from "./helpers";

let db: Db;

beforeAll(async () => {
  db = await makeTestDb();
});

function event(sourceId: string) {
  return {
    source: "synthetic",
    source_id: sourceId,
    tenant_id: "demo",
    op: "upsert" as const,
    payload: { kind: "ticket", n: sourceId },
    acl: {},
    observed_at: "2026-04-01T00:00:00.000Z",
  };
}

describe("PgEventBus", () => {
  it("rejects malformed events", async () => {
    const bus = new PgEventBus(db);
    await expect(
      bus.publish([{ ...event("x"), op: "explode" as never }]),
    ).rejects.toThrow();
  });

  it("publishes and consumes in insertion order", async () => {
    const bus = new PgEventBus(db);
    await bus.publish([event("e-1"), event("e-2"), event("e-3")]);
    const batch = await bus.consume(10);
    expect(batch.map((e) => e.source_id)).toEqual(["e-1", "e-2", "e-3"]);
    expect(batch[0]!.processed_at).toBeNull();
  });

  it("markProcessed removes events from subsequent consumes", async () => {
    const bus = new PgEventBus(db);
    const batch = await bus.consume(2);
    await bus.markProcessed(batch.map((e) => e.id));
    const next = await bus.consume(10);
    expect(next.map((e) => e.source_id)).toEqual(["e-3"]);
  });
});
