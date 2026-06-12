import { executePendingRuns, tick } from "@sutra/engine";
import { getSpine, spineDisabledResponse } from "../../../../lib/spine";

export const dynamic = "force-dynamic";

// One dispatcher tick + pending agent runs. Target of the eventual cron; in
// preview it is invoked manually or by the simulation panel.
export async function POST() {
  const spinePromise = getSpine();
  if (!spinePromise) return spineDisabledResponse();
  const spine = await spinePromise;

  const result = await tick(spine);
  const runOutcomes = await executePendingRuns(spine);
  return Response.json({ ...result, runOutcomes });
}
