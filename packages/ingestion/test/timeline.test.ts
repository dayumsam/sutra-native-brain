import { describe, expect, it } from "vitest";
import { allEvents, eventsForDay, spikeTicketNos } from "../src/index";

describe("synthetic timeline", () => {
  it("is deterministic per day and overall", () => {
    expect(eventsForDay(60)).toEqual(eventsForDay(60));
    expect(eventsForDay(12)).toEqual(eventsForDay(12));
    expect(allEvents().length).toBe(allEvents().length);
    expect(allEvents().length).toBeGreaterThan(300);
  });

  it("contains the scripted incidents on their days", () => {
    const delayEmail = eventsForDay(60).find((e) => e.source === "email");
    expect(delayEmail?.payload).toMatchObject({ classification: "delay", po_number: "PO-4472" });

    const cluster = eventsForDay(68).find(
      (e) => (e.payload as { entity?: string }).entity === "cluster",
    );
    expect(cluster?.payload).toMatchObject({ cluster_key: "CL-PUMP-NOISE" });
    expect((cluster?.payload as { tickets: string[] }).tickets.length).toBeGreaterThan(20);

    const anomaly = eventsForDay(65).find((e) => e.source === "telemetry");
    expect((anomaly?.payload as { devices: string[] }).devices).toHaveLength(10);
  });

  it("concentrates the spike on the scripted batch", () => {
    const spike = spikeTicketNos(70);
    const onSpikeBatch = spike.filter((no) => no.includes("-S")).length;
    const onSecondBatch = spike.filter((no) => no.includes("-T")).length;
    expect(onSpikeBatch).toBe(3 * 16); // 3/day, days 55–70
    expect(onSecondBatch).toBe(8); // every other day — stays under the trigger threshold
  });
});
