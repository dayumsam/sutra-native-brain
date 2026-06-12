import { getLogger, type ChangeEvent } from "@sutra/contracts";
import type { Connector } from "../connector";
import { dateOf } from "../synthetic/timeline";
import { parseRawArtifact, parseRawKey } from "./shapes";
import type { RawStore } from "./store";

const log = getLogger("ingest.raw-connector");

// Within one day, dependency order across systems: ERP master data first,
// tickets before the analytics exports that reference them.
const SOURCE_ORDER: Record<string, number> = { "sap-erp": 0, zendesk: 1, mail: 2, analytics: 3 };

// Reads raw artifacts from object storage and parses them into ChangeEvents —
// the path real connector data will take. The cursor is the last ingested day.
export class RawStoreConnector implements Connector {
  readonly source = "raw-store";

  constructor(
    private readonly store: RawStore,
    private readonly tenantId: string,
  ) {}

  async *fullSync(): AsyncGenerator<ChangeEvent> {
    yield* this.incrementalSync("-1");
  }

  async *incrementalSync(cursor: string): AsyncGenerator<ChangeEvent> {
    const afterDay = Number(cursor);
    const keys = await this.store.listKeys(`raw/${this.tenantId}/`);
    const parsed = keys
      .map((key) => ({ key, meta: parseRawKey(key) }))
      .filter(({ meta }) => meta.day > afterDay)
      .sort(
        (a, b) =>
          a.meta.day - b.meta.day ||
          (SOURCE_ORDER[a.meta.rawSource] ?? 9) - (SOURCE_ORDER[b.meta.rawSource] ?? 9) ||
          a.meta.sourceId.localeCompare(b.meta.sourceId),
      );

    for (const { key, meta } of parsed) {
      try {
        const body = await this.store.getBody(key);
        const payload = parseRawArtifact(meta.rawSource, body);
        yield {
          source: meta.rawSource,
          source_id: meta.sourceId,
          tenant_id: meta.tenantId,
          op: "upsert",
          payload,
          acl: {},
          observed_at: observedAt(meta.rawSource, meta.day, payload),
        };
      } catch (error) {
        log.error({ key, error: String(error) }, "failed to parse raw artifact");
      }
    }
  }
}

function observedAt(rawSource: string, day: number, payload: Record<string, unknown>): string {
  if (rawSource === "zendesk" && typeof payload.opened_at === "string") {
    return new Date(payload.opened_at).toISOString();
  }
  return dateOf(day, rawSource === "analytics" ? 18 : 8);
}
