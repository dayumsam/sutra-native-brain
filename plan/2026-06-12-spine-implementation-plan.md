# Phase-1 Spine Implementation Plan

**Spec:** `plan/2026-06-12-spine-design.md` (approved 2026-06-12)
**Branch:** `spine` — never merge to `main` without explicit approval.

**Goal:** Build the modular, ontology-agnostic spine (canonical graph + synthetic ingestion + trigger-driven agent runs with real LLM synthesis) and wire the existing demo UI to it, fully traced in Langfuse.

**Tech stack:** npm workspaces · TypeScript · Zod · drizzle-orm + drizzle-kit (Postgres/Neon, pgvector) · PGlite (tests, has pgvector) · Vitest · AI SDK v6 via AI Gateway · `@vercel/otel` → Langfuse (OTLP) · existing Next.js 16 app at repo root.

**Execution conventions:** Each task ends green (typecheck + tests) and committed. Tests first where the behavior is non-trivial (ontology composition, resolution, traversal, dedupe, citation validation). Spans + structured logs are added in the same task as the code they observe, not retrofitted.

---

## Task 0: Workspace scaffolding

**Files:** `package.json` (add `"workspaces": ["packages/*", "packages/ontologies/*", "customers/*"]`), root `tsconfig.base.json` (strict, path aliases `@sutra/*`), `vitest.workspace.ts`, `.env.example`.

- [ ] Add workspaces + dev deps: `typescript`, `vitest`, `zod`, `drizzle-orm`, `drizzle-kit`, `pg`, `@electric-sql/pglite`, `ai`, `@vercel/otel`, `@opentelemetry/api`.
- [ ] Add scripts: `"test": "vitest run"`, `"typecheck": "tsc -b"`.
- [ ] Verify `npm run build` for the Next app still passes untouched.
- [ ] Commit: `chore: npm workspaces scaffolding for spine packages`

## Task 1: `packages/contracts`

**Files:** `packages/contracts/src/{events,signals,insights,tenant,bus,logger}.ts`, `index.ts`, tests in `packages/contracts/test/`.

Types (Zod schemas + inferred types, so they validate at runtime boundaries):

```ts
// events.ts
export const ChangeEvent = z.object({
  source: z.string(), source_id: z.string(), tenant_id: z.string(),
  op: z.enum(['upsert', 'delete']),
  payload: z.record(z.unknown()), acl: z.record(z.unknown()).default({}),
  observed_at: z.string().datetime(),
});
// bus.ts — interface only; Postgres impl lives in graph package
export interface EventBus {
  publish(events: ChangeEvent[]): Promise<void>;
  consume(batch: number): Promise<StoredEvent[]>;   // unprocessed, ordered
  markProcessed(ids: bigint[]): Promise<void>;
}
// insights.ts — the demo schema, citations required
export const Fact = z.object({ text: z.string(), citations: z.array(z.string()).min(1) });
export const InsightContent = z.object({
  headline: z.string(), narrative: z.string(), facts: z.array(Fact),
  recommendations: z.array(z.object({ action: z.string(), why: z.array(Fact) })),
  artifacts: z.array(z.object({ kind: z.string(), title: z.string(), body: z.string() })).default([]),
});
// tenant.ts
export type TenantContext = { tenantId: string };
// logger.ts — JSON logger that injects active OTel trace/span ids into every line
export function getLogger(scope: string): Logger;   // .debug/.info/.warn/.error(obj, msg)
```

- [ ] Implement + test `logger` trace-id injection (use `@opentelemetry/api` `trace.getActiveSpan()`).
- [ ] Commit: `feat(contracts): shared types, event bus interface, traced logger`

## Task 2: `packages/ontology-core`

**Files:** `packages/ontology-core/src/{entity,edge,trigger,traversal,ontology,compose,registry}.ts`, tests.

```ts
defineEntityType(name, { schema: ZodObject, keys: string[], card: (props) => string })
defineEdgeType(name, { src: EntityType | string, dst: EntityType | string })
defineTraversal(name, { steps: Array<{ edge: string, direction: 'out'|'in', label: string }>,
                        maxNodes: number, weights?: Record<string, number> })
defineTrigger(key, {
  kind: 'event' | 'threshold' | 'graph-pattern',
  // event: predicate over ChangeEvent; threshold/graph-pattern: SQL via a QueryBuilder
  detect: EventPredicate | { sql: string, params: (ctx) => unknown[] },
  severity: 'info'|'warn'|'critical',
  dedupeKey: (detection) => string,
  rateLimit?: { windowMinutes: number },
  traversal: string,                 // traversal name to run on fire
  audience: 'tenant',                // phase-1 fixed
})
defineOntology({ entities, edges, triggers, traversals, sources })  // sources: per-source field mappings
composeOntology(base, { extend?, override? })  // extend merges entity schemas (z.object extend),
                                               // adds new defs; override replaces by name
OntologyRegistry.register(tenantId, ontology) / .get(tenantId)  // throws on unknown tenant
```

`Ontology.validateEntity(type, props)` and `.validateEdge(type, srcType, dstType)` are the write-boundary gates the graph package calls.

- [ ] Tests first: compose extend (adds attribute, keeps base validation), compose override (replaces trigger threshold), unknown-type rejection, registry resolution.
- [ ] Implement; commit: `feat(ontology-core): ontology definition + composition framework`

## Task 3: Database + `packages/graph` (store, bus, traversal, search)

**Files:** `packages/graph/src/{schema.ts,db.ts,store.ts,bus.ts,traverse.ts,search.ts,embed.ts}`, `packages/graph/drizzle/` migrations, tests with PGlite (`vector` extension enabled).

- [ ] Provision Neon via Vercel Marketplace; set `DATABASE_URL` in **Preview env only** + `.env.local`. Local dev uses a Neon branch database.
- [ ] Drizzle schema exactly per spec §3 (8 tables, `vector(1536)` columns, `tsv` generated column, unique `(tenant_id, type, key)`, indexes on `edges(src)`, `edges(dst)`, `events(processed_at) WHERE processed_at IS NULL`, `signals(dedupe_key)` unique). Generate migration with drizzle-kit.
- [ ] `store.ts`: `upsertEntity/upsertEdge/upsertDocument(ctx, ontology, input)` — validates via ontology, rejects unknown types; tombstone on `op: delete`; renders `card_text`; embedding computed in `embed.ts` (AI SDK `embed`, gateway model `openai/text-embedding-3-small`; injectable fake for tests).
- [ ] `bus.ts`: `PgEventBus` implementing `contracts.EventBus` over the `events` table (insert; `SELECT ... WHERE processed_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`; update `processed_at`).
- [ ] `traverse.ts`: `extractSubgraph(ctx, traversal, rootIds)` — recursive CTE following the traversal's typed edge steps, capped at `maxNodes`, ranked by edge weight + `observed_at` recency; returns `{nodes, edges}` with stable ids.
- [ ] `search.ts`: `hybridSearch(ctx, query, k)` — pgvector cosine + `ts_rank` FTS, reciprocal-rank-fusion merge.
- [ ] Every public function wrapped in a span (`graph.upsert`, `graph.traverse`, `graph.search`) with `tenant_id`, counts, duration.
- [ ] Tests (PGlite): tenant isolation (tenant A never reads B), validation rejection, traversal follows declared chain and respects cap, FTS finds exact lot codes (`"P-88A"`).
- [ ] Commit: `feat(graph): canonical store, event bus, traversal, hybrid search`

## Task 4: Observability bootstrap (Langfuse + tracing)

**Files:** `instrumentation.ts` (modify — keep PostHog log exporter), `.env.example`.

- [ ] Sign up Langfuse cloud (free tier); keys `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` in Preview env + `.env.local` only.
- [ ] `registerOTel({ serviceName: 'native-operating-brain', traceExporter: new OTLPTraceExporter({ url: 'https://us.cloud.langfuse.com/api/public/otel/v1/traces', headers: { Authorization: 'Basic ' + base64(pk:sk) } }) })` — no-op when keys absent (prod safety).
- [ ] Smoke-test: hit a dev route, see the trace in Langfuse with graph spans nested.
- [ ] Commit: `feat(observability): OTel tracing to Langfuse alongside PostHog logs`

## Task 5: `packages/ontologies/manufacturing` + `customers/demo`

**Files:** `packages/ontologies/manufacturing/src/{entities,edges,triggers,traversals,sources,index}.ts`, `customers/demo/src/index.ts`, tests.

- [ ] Entities (from spec): `Supplier, SupplierLot, Component, Batch, PurchaseOrder, Device, ServiceTicket, ComplaintCluster, WarrantyClaim` — schemas mirror the fields the demo UI displays (cross-check `lib/demo-data.ts` while writing).
- [ ] Edges: `USES_LOT (Batch→SupplierLot)`, `SUPPLIED_BY (SupplierLot→Supplier)`, `BUILT_IN (Device→Batch)`, `ABOUT (ServiceTicket→Device)`, `SUPPLIES (PurchaseOrder→Component)`, `FOR_LOT (PurchaseOrder→SupplierLot)`, `CLUSTERS (ComplaintCluster→ServiceTicket)`, `CLAIMS (WarrantyClaim→Device)`.
- [ ] Triggers: `quality-spike` (threshold: tickets-per-batch 7-day rate vs trailing 30-day baseline, z ≥ 3), `supplier-delay` (event: email/PO event classified `delay` in payload), `lot-exposure` (graph-pattern: complaint cluster + shared lot + lot referenced by open PO).
- [ ] Traversal `quality-trace`: Batch →USES_LOT→ SupplierLot →SUPPLIED_BY→ Supplier, SupplierLot ←FOR_LOT← open POs, Batch ←BUILT_IN← Devices ←ABOUT← Tickets, plus WarrantyClaims; `maxNodes: 60`.
- [ ] `customers/demo`: `composeOntology(manufacturing, { extend: { Device: { water_hardness_zone: z.string().optional() } } })`, register as tenant `demo`. (The extension exists to keep the compose path exercised end-to-end.)
- [ ] Commit: `feat(ontology): manufacturing base + demo customer composition`

## Task 6: `packages/ingestion` — connector contract, normalizer, synthetic timeline

**Files:** `packages/ingestion/src/{connector.ts,normalizer.ts,synthetic/{timeline.ts,generators.ts,incidents.ts}}`, tests.

- [ ] `connector.ts`: `interface Connector { source: string; fullSync(): AsyncGenerator<ChangeEvent>; incrementalSync(cursor: string): AsyncGenerator<ChangeEvent>; }` (ACL/tombstone hooks present, stub impls).
- [ ] `normalizer.ts`: `processEvents(ctx, ontology, bus, batch)` — consume → map via `ontology.sources[event.source]` field mappings → deterministic resolution by declared keys → `store.upsert*` → emit document for text-bearing payloads → `markProcessed`. Span per batch with counts.
- [ ] `synthetic/`: seeded PRNG (mulberry32, seed in code). 90-day timeline indexed by day: ~6 suppliers, ~20 lots, ~30 batches, ~400 devices, baseline ticket noise; scripted incidents — day 55–70 complaint spike on one batch traceable to one lot with an open PO; day 60 supplier delay email thread; day 50–75 telemetry-drift signal entities on a device cohort. `eventsForDay(day): ChangeEvent[]` is pure and deterministic.
- [ ] Test: same seed ⇒ identical event stream; replay test — process days 0–90 twice into fresh DBs ⇒ identical entity/edge counts; replay with modified ontology (extra attribute) succeeds without re-generation.
- [ ] Commit: `feat(ingestion): connector contract, normalizer, seeded synthetic timeline`

## Task 7: `packages/engine` — detect

**Files:** `packages/engine/src/{dispatcher.ts,detectors.ts,signals.ts}`, tests.

- [ ] `detectors.ts`: run a tenant ontology's triggers — event triggers against the just-processed batch; threshold + graph-pattern triggers as parameterized SQL against the graph. Each detection → candidate signal.
- [ ] `signals.ts`: insert with `ON CONFLICT (dedupe_key) DO NOTHING` + rate-limit window check; span records dedupe hits.
- [ ] `dispatcher.ts`: `tick(ctx)` = `processEvents` → run detectors → for each new signal, enqueue an agent run (insert `agent_runs` row `status: 'pending'`). One root span per tick.
- [ ] Test: replay timeline through day 70 ⇒ `quality-spike` fires **exactly once** for the scripted batch despite ~50 spike tickets; `lot-exposure` fires once; no signals before day 55.
- [ ] Commit: `feat(engine): dispatcher and three detector kinds with dedupe`

## Task 8: `packages/engine` — investigate + synthesize + route

**Files:** `packages/engine/src/{investigate.ts,synthesize.ts,verify.ts,route.ts,run.ts}`, tests.

- [ ] `investigate.ts`: signal → its trigger's traversal → `extractSubgraph` + `hybridSearch` for related docs → render context: one line per node `[id] Type: card_text`, one per edge, one block per doc chunk. Snapshot stored on the run.
- [ ] `synthesize.ts`: AI SDK `generateObject({ model: 'anthropic/claude-sonnet-4-6', schema: InsightContent, ... , experimental_telemetry: { isEnabled: true } })`. System prompt mandates citations from provided `[id]`s only.
- [ ] `verify.ts`: (a) code check — every `Fact.citations[]` id ∈ subgraph/doc ids, else one retry then mark run `degraded`, withhold insight; (b) verifier LLM pass (`anthropic/claude-haiku-4-5`) checking numeric facts against cited node properties, result stored on the run.
- [ ] `route.ts`: insert `insights` row (audience: tenant), skip if a non-superseded insight exists for the same signal.
- [ ] `run.ts`: `executeAgentRun(runId)` orchestrates the above, updating `agent_runs.steps` as it goes; root span `agent.run` carrying `signal_id`/`agent_run_id`.
- [ ] Tests: citation validator (fake model returning bad citations ⇒ retry ⇒ degraded); full run with injectable fake model ⇒ insight row with resolving citations. Live-model path exercised manually in dev, asserted structurally in the integration test.
- [ ] Commit: `feat(engine): investigation, cited synthesis, verification, routing`

## Task 9: API routes (dispatcher + simulation)

**Files:** `app/api/spine/{tick,advance,reset,runs,insights}/route.ts`, `vercel.json` or `vercel.ts` cron entry (branch-scoped), `lib/spine.ts` (server-only init: registry + db).

- [ ] `POST /api/spine/advance { toDay }` — feed `eventsForDay` for un-fed days into the bus, then `tick()`, then execute pending agent runs. Idempotent (tracks fed day in a `meta` table row).
- [ ] `POST /api/spine/reset` — truncate spine tables (guarded: refuses when `VERCEL_ENV === 'production'`).
- [ ] `GET /api/spine/runs`, `GET /api/spine/insights` — list with status, token counts, Langfuse trace ids.
- [ ] Cron `*/10 * * * *` → `tick()` (no-op when no unprocessed events; preview only).
- [ ] All routes require `DATA_MODE=graph` else 404 — prod stays inert.
- [ ] Commit: `feat(api): spine dispatcher, simulation, and inspection routes`

## Task 10: UI wiring

**Files:** `lib/data-source.ts` (new — `DATA_MODE` switch), modify `app/page.tsx` + the three panel components' data entry points only, `app/spine/page.tsx` (dev simulation panel).

- [ ] `lib/data-source.ts`: `DATA_MODE=demo` (default) returns `lib/demo-data.ts` shapes; `graph` maps Postgres insights + subgraph snapshots into those same UI shapes (adapter layer — components unchanged as far as possible).
- [ ] Simulation panel (`/spine`, hidden unless `DATA_MODE=graph`): reset / advance-to-day slider / signals + agent-runs table with status, tokens, deep link `https://cloud.langfuse.com/...traceId`.
- [ ] Verify: `DATA_MODE` unset ⇒ `npm run build` output behaves identically to `main` (manual diff of rendered home page).
- [ ] Commit: `feat(ui): graph-backed data source behind DATA_MODE + simulation panel`

## Task 11: End-to-end integration test + docs

**Files:** `packages/engine/test/e2e-timeline.test.ts`, `README.spine.md`.

- [ ] The test that matters (PGlite, fake embedder + fake synth model): replay days 0→90 via dispatcher ⇒ assert (1) quality-spike signal exactly once, (2) subgraph contains batch→lot→supplier→open-PO chain, (3) insight citations all resolve, (4) replay after ontology modification still passes.
- [ ] `README.spine.md`: env setup (Neon, Gateway, Langfuse), how to run the simulation, how to read a trace.
- [ ] Full suite green: `npm run typecheck && npm test && npm run build`.
- [ ] Commit: `test(e2e): timeline replay through full spine + spine README`

---

## Task order & dependencies

0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11. Tasks 4 and 5 can swap; everything else is sequential. Each task leaves the branch deployable as a preview.

## Self-review against spec

- Spec §1 layout → T0–2, 5, 6, 7–8; §2 ontology framework → T2, 5; §3 store → T3; §4 ingestion → T6; §5 synthetic data → T6; §6 engine → T7–8; §7 serving → T9–10; §8 deployment safety → T9 guards, T10 default, env scoping in T3/T4; §9 observability → T1 (logger), T3/T7/T8 spans, T4 backend; §10 testing → per-task tests + T11. No gaps found.
