# Phase 1 Design — Modular Spine + Trigger-Driven Agent Testbed

**Date:** 2026-06-12
**Status:** Approved design, pre-implementation
**Branch:** `spine` (production deploys from `main` are unaffected)

## Goal

Build the first part of ARCHITECTURE.md — the spine (ingestion → normalization → canonical context graph) — plus enough of the proactive engine to test the full loop: synthetic data flows in, triggers fire, agents extract a subgraph, synthesize a cited insight, and the existing demo UI renders it from the real graph.

The defining requirement: the canonical layer is **ontology-agnostic**. Each customer can have a fully customer-specific ontology (entity types, edges, resolution keys, traversal templates, triggers), declared as composable TypeScript packages. Nothing in the platform hardcodes a vertical.

## Decisions made (with rationale)

| Decision | Choice | Why |
|---|---|---|
| Modularity model | Ontology-agnostic platform; verticals/customers are packages | Customers may be in entirely different verticals |
| Ontology definition | TypeScript packages using Zod schemas, composed per customer | Type safety, code review, testability; engineers onboard customers for now |
| Repo shape | npm workspaces monorepo; Next.js app stays at repo root | Single deploy, no Vercel config churn, packages extractable to a separate service later |
| Build vs buy | Own 5 thin packages (contracts, ontology-core, graph, ingestion, engine); borrow Postgres+pgvector, AI SDK + AI Gateway, Zod | No OSS product matches a multi-tenant, per-customer-ontology typed graph (Onyx is document-centric/horizontal; Graphiti is Python/Neo4j/LLM-extraction-centric — used as design reference only) |
| Event runtime | Append-only Postgres `events` table + dispatcher (cron route + manual "advance timeline" endpoint) | Zero new infra, fully replayable, deterministic to test; `EventBus` is an interface so Kafka/Inngest can replace it later |
| Agent runs | Real LLM synthesis via AI SDK `generateObject` through AI Gateway | Tests the genuine end-to-end loop including citation enforcement |
| Data | Deterministic, seeded synthetic timeline (~90 days) | Reproducible replays; replay-against-modified-ontology is the core test loop |
| Database | Postgres (Neon via Vercel) + pgvector + Postgres FTS | Doc §3: no graph DB, no OpenSearch until demonstrated need |
| Deployment safety | All work on `spine` branch; `main` stays prod | Current codebase state is serving production |
| Observability | OpenTelemetry tracing everywhere + Langfuse as trace backend | Every LLM call, graph query, and pipeline stage visible for debugging |

## 1. Repo layout

```
packages/
  contracts/                  Shared types only: ChangeEvent, EventBus, Signal,
                              Insight, TenantContext. Zero runtime dependencies.
  ontology-core/              Meta-framework: defineEntityType, defineEdgeType,
                              defineTrigger, defineTraversal, defineOntology,
                              composeOntology, tenant registry. No domain content.
  graph/                      Canonical store on Postgres: ontology-validated
                              write API, k-hop traversal (recursive CTEs),
                              hybrid search (pgvector + FTS). Only package with SQL.
  ingestion/                  Connector contract (fullSync / incremental / ACL /
                              tombstones as async generators), SyntheticConnector,
                              normalizer (ChangeEvent → entities/edges/documents).
  engine/                     detect → investigate → synthesize → route.
  ontologies/manufacturing/   Vertical base: Batch, SupplierLot, Supplier,
                              PurchaseOrder, Device, ServiceTicket,
                              ComplaintCluster, WarrantyClaim + edges + triggers
                              + traversal templates.
customers/
  demo/                       composeOntology(manufacturing, { extensions }),
                              bound to tenant "demo" in the registry.
app/                          Existing Next.js app (root) — reads the real graph
                              on this branch.
```

Dependency rule: every package depends on `contracts`; nothing reaches into a sibling's internals. `engine` depends on `graph` and `ontology-core`. Ontology packages depend only on `ontology-core`.

## 2. Ontology framework (`ontology-core`)

An `Ontology` is a value passed into every subsystem — nothing imports a global ontology.

```ts
const Batch = defineEntityType('Batch', {
  schema: z.object({ batch_code: z.string(), produced_at: z.string(), ... }),
  keys: ['batch_code'],                    // deterministic resolution keys
  card: (e) => `Batch ${e.batch_code} produced ${e.produced_at} ...`,  // for embedding
});

const USES_LOT = defineEdgeType('USES_LOT', { src: Batch, dst: SupplierLot });

const qualitySpike = defineTrigger('quality-spike', {
  kind: 'threshold',                       // 'event' | 'threshold' | 'graph-pattern'
  detect: ...,                             // SQL/builder over the graph
  dedupeKey: (s) => `quality-spike:${s.batchId}`,
  traversal: qualityTraversal,             // which template investigates it
  audience: (s) => [...],                  // routing, phase-1: whole tenant
});

const manufacturing = defineOntology({ entities, edges, triggers, traversals });
const demoCustomer = composeOntology(manufacturing, { extend: {...}, override: {...} });
registry.register('demo', demoCustomer);
```

Composition semantics: `extend` adds entity/edge/trigger definitions or appends attributes to existing entity schemas; `override` replaces a named definition wholesale (e.g. different trigger thresholds). A customer in an unrelated vertical skips the base and builds directly from `ontology-core` primitives — same mechanism. The tenant registry maps `tenant_id → Ontology`; every request and job resolves it from `TenantContext`.

## 3. Canonical store (`graph`)

Generic Postgres schema — the ontology gives rows meaning and validates them at the write boundary (unknown types and schema-invalid `properties` are rejected; nothing downstream trusts unvalidated data).

```sql
entities   (id, tenant_id, type, key, properties jsonb, card_text, embedding vector,
            acl jsonb, created_at, updated_at, deleted_at)
            UNIQUE (tenant_id, type, key)
edges      (id, tenant_id, type, src, dst, properties jsonb,
            valid_from, valid_to, observed_at)          -- bitemporal from day one
documents  (id, tenant_id, source, source_id, title, body, metadata jsonb, acl jsonb, ...)
chunks     (id, document_id, text, embedding vector, tsv tsvector)
events     (id bigserial, tenant_id, source, source_id, op, payload jsonb, acl jsonb,
            observed_at, processed_at)                  -- append-only event log
signals    (id, tenant_id, trigger_key, entity_id, severity, payload jsonb,
            dedupe_key, created_at)
agent_runs (id, tenant_id, signal_id, status, steps jsonb, subgraph_snapshot jsonb,
            tokens, error, created_at)
insights   (id, tenant_id, signal_id, status, content jsonb, citations jsonb,
            audience jsonb, created_at)
```

- ACL columns exist from the first migration; phase-1 value is "everyone-in-tenant". Every query carries `tenant_id`.
- Traversal: k-hop neighborhood via recursive CTEs, capped by depth and node count, ranked by edge-type weight + recency (weights come from the traversal template).
- Hybrid search: pgvector cosine over chunk + entity-card embeddings, merged with Postgres FTS (`tsv`) — covers part numbers and lot codes that embeddings handle badly. OpenSearch deferred.
- Deletions are tombstones (`deleted_at`), propagated from `op: delete` events.

## 4. Ingestion (`ingestion`)

Connector contract per ARCHITECTURE.md §1: `fullSync()` and `incrementalSync(cursor)` as async generators of `ChangeEvent` (`{source, source_id, tenant_id, op, payload, acl, observed_at}`), plus ACL sync and tombstone hooks (stubbed in phase 1). Events land in the `events` table.

The normalizer consumes events, maps them through the tenant ontology (per-source mapping declared alongside the ontology), resolves entities **deterministically only** (declared keys: lot numbers, serials, SKUs, email domains), and upserts entities/edges/documents. No probabilistic matching, no LLM resolution. Raw payloads stay in `events` permanently — replaying the log against a modified ontology is supported and tested.

## 5. Synthetic data

`SyntheticConnector` generates a deterministic (seeded) ~90-day timeline for the demo customer: suppliers, lots, batches, devices, tickets flowing normally, with scripted incidents matching the demo's workflows:

1. Complaint spike on a batch traceable through its supplier lot to open POs (the demo's killer workflow).
2. A supplier delay email thread.
3. Telemetry drift on a device cohort (pre-derived signal entities, not raw time series — per doc §1, telemetry stays out of the document pipeline).

The timeline is indexed by day; the dispatcher's "advance timeline" endpoint feeds events up to day N, so the scenario can be stepped through interactively.

## 6. Engine (`engine`)

**Detect.** The dispatcher (Vercel cron route + manual advance endpoint) processes unprocessed events: normalize → upsert → run detectors. Three kinds, all declared in the ontology: event triggers (rules on incoming events), threshold detectors (SQL over the graph, e.g. complaint rate vs trailing baseline), graph-pattern detectors (standing CTE queries). Detectors emit `signals`, deduplicated by `dedupe_key` and rate-limited (N tickets on one batch = one signal).

**Investigate.** The trigger's traversal template extracts a capped subgraph plus hybrid-search documents, rendered as structured context with stable node/document IDs.

**Synthesize.** AI SDK `generateObject` through AI Gateway against the insight schema `{headline, narrative, facts, recommendations[{action, why[]}], artifacts}`. Cheap model for triage/verification, strong model for synthesis. Hard rule enforced in code: every fact and every `why` cites node/document IDs present in the provided subgraph — violation retries once, then the run is marked `degraded` and the insight withheld. A verifier pass checks numbers in `facts` against source nodes. Every run records steps, subgraph snapshot, and token counts in `agent_runs`.

**Route.** Phase 1: audience = whole tenant; insights land in the `insights` table and surface in the UI feed. Per-audience rendering deferred.

## 7. Serving

On the branch, the existing workflow UI reads insights and graph neighborhoods from Postgres via server components/route handlers. `lib/demo-data.ts` remains a fallback behind an env flag (`DATA_MODE=demo|graph`). A dev-only simulation panel: reset DB, advance timeline to day N, list signals and agent runs.

## 8. Deployment safety

Production deploys from `main`; the current codebase state is what prod users see. Rules for this phase:

- **All commits go to the `spine` branch** (or sub-branches merged into `spine`). Nothing merges to `main` until phase 1 is reviewed and explicitly approved for release.
- Vercel preview deployments of `spine` are expected and useful — they are isolated from prod. The database connection string and AI Gateway / Langfuse keys are set as **Preview-environment variables only** (scoped to the branch where possible), so production has no path to the new database and prod builds are bit-for-bit unaffected.
- The `DATA_MODE` flag defaults to `demo` when unset, so even if spine code ever reached a prod build, the UI behavior would be unchanged without explicit env configuration.

## 9. Observability and tracing

Debuggability is a first-class requirement: every pipeline stage must be visible. Three layers:

**Traces (OpenTelemetry + Langfuse).** `@vercel/otel` registers tracing in `instrumentation.ts` (coexisting with the existing OTel→PostHog log exporter), exporting OTLP to **Langfuse** (open-source LLM observability; nested trace trees, full prompts/completions, token costs, latency breakdowns). One trace per dispatcher tick and per agent run, with spans for every stage:

- `ingest.normalize` (event id, source, resolved entity keys, upsert counts)
- `graph.query` / `graph.traverse` (query name, tenant, row/node counts, duration)
- `detect.<trigger-key>` (events scanned, signals emitted, dedupe hits)
- `investigate.subgraph` (node/edge counts, cap hits, doc-search results)
- `synthesize.llm` — via AI SDK `experimental_telemetry`, capturing model, full prompt, completion, token usage, and cost per call (triage, synthesis, and verifier calls each visible separately)
- `verify.citations` (facts checked, violations, retry/degrade outcome)

Spans carry `tenant_id`, `signal_id`, and `agent_run_id` attributes so a single agent run can be followed end to end in one Langfuse trace tree.

**Structured logs.** A shared logger in `contracts` (thin wrapper, pino-style JSON) that injects the active trace/span ID into every log line, so logs and traces cross-link. Verbose by default in dev/preview (`LOG_LEVEL=debug`): SQL statements with parameters, rendered LLM context, detector evaluation details. Logs continue flowing to PostHog via the existing exporter; locally they pretty-print to the console.

**Domain records.** Independent of any vendor: `agent_runs` stores steps, the exact subgraph snapshot sent to the model, token counts, and errors; `events.processed_at` and `signals` make the pipeline's state inspectable with plain SQL. The dev simulation panel surfaces these in the UI with deep links to the corresponding Langfuse trace.

## 10. Testing

- **Unit:** ontology validation and composition (extend/override), deterministic resolution keys, traversal CTE correctness, citation validator.
- **Integration (the one that matters):** replay the full synthetic timeline → assert the quality-spike signal fires exactly once (dedupe works), the extracted subgraph contains the expected batch → lot → supplier → open-PO chain, and the synthesized insight's citations all resolve to subgraph IDs. LLM assertions are structural (schema + citation validity), never prose comparison.
- **Replay test:** modify the demo ontology (add an attribute, change a threshold), replay the same event log, assert the graph and signals reflect the change without re-ingestion.

## Out of scope (phase 2+)

Real connectors (Airbyte/Nango/dlt), probabilistic entity resolution (Splink/Zingg), OpenFGA / SCIM / source-ACL mirroring, per-audience insight rendering, OpenSearch, Temporal/Inngest, graph database, feedback capture and eval harness on historical incidents.

## The two hard problems, tracked from day one

Per ARCHITECTURE.md: entity-resolution quality (phase 1 keeps it deterministic-only, with `same_as` reversible-merge design deferred but schema-compatible) and trust calibration of proactive output (citation enforcement + verifier pass are in scope now, not polish later).
