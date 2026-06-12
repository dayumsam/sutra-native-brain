import type { ChangeEvent } from "@sutra/contracts";

// Uniform connector contract (ARCHITECTURE.md §1). Phase 1 ships only the
// synthetic connector; real connectors implement the same surface, including
// the parts stubbed for now (ACL sync, tombstones via op:"delete").
export interface Connector {
  readonly source: string;
  /** Initial backfill. Must be resumable by the caller checkpointing events. */
  fullSync(): AsyncGenerator<ChangeEvent>;
  /** Changes since a cursor (source-defined format). */
  incrementalSync(cursor: string): AsyncGenerator<ChangeEvent>;
}
