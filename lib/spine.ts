import { buildRegistry, DEMO_TENANT_ID } from "@sutra/customer-demo";
import {
  GatewaySynthesizer,
  GatewayVerifier,
  type RunDeps,
} from "@sutra/engine";
import {
  createDb,
  GatewayEmbedder,
  GraphStore,
  migrate,
  PgEventBus,
} from "@sutra/graph";

export type SpineContext = RunDeps & { tenantId: string };

const g = globalThis as { __spine?: Promise<SpineContext> };

// Server-side spine singleton. Returns null unless DATA_MODE=graph, so a
// production build without the env var has no code path into the database.
export function getSpine(): Promise<SpineContext> | null {
  if (process.env.DATA_MODE !== "graph") return null;
  g.__spine ??= (async () => {
    const db = createDb();
    await migrate(db); // idempotent, forward-only
    const embedder = new GatewayEmbedder();
    return {
      db,
      store: new GraphStore(db, embedder),
      bus: new PgEventBus(db),
      registry: buildRegistry(),
      embedder,
      synthesizer: new GatewaySynthesizer(),
      verifier: new GatewayVerifier(),
      tenantId: DEMO_TENANT_ID,
    };
  })();
  return g.__spine;
}

export function spineDisabledResponse(): Response {
  return Response.json({ error: "spine disabled (DATA_MODE != graph)" }, { status: 404 });
}
