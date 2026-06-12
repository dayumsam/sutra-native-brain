import { sql } from "drizzle-orm";
import { executePendingRuns, tick } from "@sutra/engine";
import { eventsForDay, TIMELINE_DAYS } from "@sutra/ingestion";
import { getSpine, spineDisabledResponse } from "../../../../lib/spine";

export const dynamic = "force-dynamic";

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

  let published = 0;
  const signalIds: string[] = [];
  for (let day = fedDay + 1; day <= toDay; day++) {
    const events = eventsForDay(day);
    await spine.bus.publish(events);
    published += events.length;
    const result = await tick(spine);
    signalIds.push(...result.newSignalIds);
  }

  await spine.db.execute(sql`
    INSERT INTO meta (tenant_id, k, v)
    VALUES (${spine.tenantId}, 'fed_day', ${JSON.stringify(Math.max(fedDay, toDay))}::jsonb)
    ON CONFLICT (tenant_id, k) DO UPDATE SET v = EXCLUDED.v
  `);

  const runOutcomes = await executePendingRuns(spine);

  return Response.json({
    fromDay: fedDay + 1,
    toDay,
    published,
    newSignals: signalIds.length,
    runOutcomes,
  });
}
