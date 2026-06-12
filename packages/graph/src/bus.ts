import { sql } from "drizzle-orm";
import {
  ChangeEventSchema,
  withSpan,
  type ChangeEvent,
  type EventBus,
  type StoredEvent,
} from "@sutra/contracts";
import type { Db } from "./db";

// EventBus over the append-only events table (the doc's bus, in miniature).
export class PgEventBus implements EventBus {
  constructor(private readonly db: Db) {}

  async publish(events: ChangeEvent[]): Promise<void> {
    if (events.length === 0) return;
    await withSpan("bus.publish", { "events.count": events.length }, async () => {
      for (const raw of events) {
        const event = ChangeEventSchema.parse(raw);
        await this.db.execute(sql`
          INSERT INTO events (tenant_id, source, source_id, op, payload, acl, observed_at)
          VALUES (${event.tenant_id}, ${event.source}, ${event.source_id}, ${event.op},
                  ${JSON.stringify(event.payload)}::jsonb, ${JSON.stringify(event.acl)}::jsonb,
                  ${event.observed_at})
        `);
      }
    });
  }

  async consume(batch: number): Promise<StoredEvent[]> {
    const result = await this.db.execute(sql`
      SELECT id, tenant_id, source, source_id, op, payload, acl,
             observed_at, processed_at
      FROM events WHERE processed_at IS NULL
      ORDER BY id LIMIT ${batch}
      FOR UPDATE SKIP LOCKED
    `);
    return result.rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        tenant_id: r.tenant_id,
        source: r.source,
        source_id: r.source_id,
        op: r.op,
        payload: r.payload,
        acl: r.acl,
        observed_at: new Date(r.observed_at as string).toISOString(),
        processed_at: r.processed_at ? new Date(r.processed_at as string).toISOString() : null,
      } as StoredEvent;
    });
  }

  async markProcessed(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.execute(sql`
      UPDATE events SET processed_at = now()
      WHERE id = ANY(${sql.raw(`ARRAY[${ids.map((i) => `'${i}'`).join(",")}]::bigint[]`)})
    `);
  }
}
