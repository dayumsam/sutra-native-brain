import { sql } from "drizzle-orm";
import type { ChangeEvent } from "@sutra/contracts";
import { executePendingRuns, tick } from "@sutra/engine";
import {
  BlobRawStore,
  eventsForDay,
  RawStoreConnector,
  TIMELINE_DAYS,
} from "@sutra/ingestion";
import { getSpine, spineDisabledResponse } from "../../../../lib/spine";

export const dynamic = "force-dynamic";

const dayOf = (event: ChangeEvent) =>
  Math.floor((Date.parse(event.observed_at) - Date.UTC(2026, 2, 1)) / 86_400_000);

// RAW_SOURCE=blob ingests realistic raw artifacts from Vercel Blob through
// the RawStoreConnector (the path real connector data takes); the default is
// the in-process synthetic generator.
async function eventsByDay(fedDay: number, toDay: number, tenantId: string) {
  const byDay = new Map<number, ChangeEvent[]>();
  if (process.env.RAW_SOURCE === "blob") {
    const connector = new RawStoreConnector(new BlobRawStore(), tenantId);
    for await (const event of connector.incrementalSync(String(fedDay))) {
      const day = dayOf(event);
      if (day > toDay) continue;
      byDay.set(day, [...(byDay.get(day) ?? []), event]);
    }
  } else {
    for (let day = fedDay + 1; day <= toDay; day++) byDay.set(day, eventsForDay(day));
  }
  return byDay;
}

// Advance the synthetic timeline to a given day: publish each un-fed day's
// events, tick the dispatcher per day (cron cadence in miniature), then
// execute any agent runs the detectors enqueued. Idempotent via meta.fed_day.
export async function POST(request: Request) {
  const spinePromise = getSpine();
  if (!spinePromise) return spineDisabledResponse();
  const spine = await spinePromise;

  const body = (await request.json().catch(() => ({}))) as { toDay?: number };
  const toDay = Math.min(Math.max(0, body.toDay ?? 0), TIMELINE_DAYS);

  const fedRow = await spine.db.execute(sql`
    SELECT v FROM meta WHERE tenant_id = ${spine.tenantId} AND k = 'fed_day'
  `);
  const fedDay = fedRow.rows[0] ? Number((fedRow.rows[0] as { v: unknown }).v) : -1;

  const byDay = await eventsByDay(fedDay, toDay, spine.tenantId);
  let published = 0;
  const signalIds: string[] = [];
  for (let day = fedDay + 1; day <= toDay; day++) {
    const events = byDay.get(day) ?? [];
    await spine.bus.publish(events);
    published += events.length;
    const result = await tick(spine);
    signalIds.push(...result.newSignalIds);
    // Checkpoint per day so an interrupted request resumes, not replays.
    await spine.db.execute(sql`
      INSERT INTO meta (tenant_id, k, v)
      VALUES (${spine.tenantId}, 'fed_day', ${JSON.stringify(day)}::jsonb)
      ON CONFLICT (tenant_id, k) DO UPDATE SET v = EXCLUDED.v
    `);
  }

  const runOutcomes = await executePendingRuns(spine);

  return Response.json({
    fromDay: fedDay + 1,
    toDay,
    published,
    newSignals: signalIds.length,
    runOutcomes,
  });
}
