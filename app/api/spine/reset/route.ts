import { sql } from "drizzle-orm";
import { getSpine, spineDisabledResponse } from "../../../../lib/spine";

export const dynamic = "force-dynamic";

// Wipe spine data (not the schema) so the timeline can be replayed.
// Refuses outright in the production environment.
export async function POST() {
  if (process.env.VERCEL_ENV === "production") {
    return Response.json({ error: "reset is disabled in production" }, { status: 403 });
  }
  const spinePromise = getSpine();
  if (!spinePromise) return spineDisabledResponse();
  const spine = await spinePromise;

  await spine.db.execute(sql`
    TRUNCATE insights, agent_runs, signals, doc_mentions, chunks, documents,
             edges, entities, events, meta
  `);
  return Response.json({ reset: true });
}
