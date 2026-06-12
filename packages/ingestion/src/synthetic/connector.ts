import type { ChangeEvent } from "@sutra/contracts";
import type { Connector } from "../connector";
import { allEvents, eventsForDay, TIMELINE_DAYS } from "./timeline";

// Connector facade over the deterministic timeline. The cursor is the last
// fed day, so incrementalSync exercises the same checkpoint shape a real
// connector would use.
export class SyntheticConnector implements Connector {
  readonly source = "synthetic";

  async *fullSync(): AsyncGenerator<ChangeEvent> {
    for (const event of allEvents()) yield event;
  }

  async *incrementalSync(cursor: string): AsyncGenerator<ChangeEvent> {
    const lastDay = Number(cursor);
    for (let day = lastDay + 1; day <= TIMELINE_DAYS; day++) {
      for (const event of eventsForDay(day)) yield event;
    }
  }
}
