import type { ChangeEvent, StoredEvent } from "./events";

// Event log abstraction. Phase 1 implements this over a Postgres table
// (packages/graph); Kafka/Inngest can replace it without touching consumers.
export interface EventBus {
  publish(events: ChangeEvent[]): Promise<void>;
  /** Fetch up to `batch` unprocessed events in insertion order. */
  consume(batch: number): Promise<StoredEvent[]>;
  markProcessed(ids: string[]): Promise<void>;
}
