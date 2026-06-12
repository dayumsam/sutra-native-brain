# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical rule: `main` is production

The current state of `main` is deployed to production (Vercel) and actively used. **Never commit new backend/spine work to `main` and never merge `spine` into `main` without the user's explicit approval.** All phase-1 platform work happens on the `spine` branch (or sub-branches merged into `spine`). Vercel preview deployments of branches are fine and expected. New secrets (database, AI Gateway, Langfuse) go in Vercel **Preview**-environment variables only — production must have no path to them. The `DATA_MODE` env flag must default to `demo` so prod behavior is unchanged if spine code ever reaches a prod build.

## Commands

- `npm run dev` — dev server (Next.js)
- `npm run build` — production build
- `npm run lint` — ESLint

There is no test runner configured yet; the phase-1 spec calls for one (unit + timeline-replay integration tests) when the spine packages land.

## What this repo is

Two things at different maturity levels:

1. **The live demo (on `main`, in prod):** a Next.js 16 App Router app showing the Sutra concept — proactive analysis over a manufacturing-ops context graph. It is entirely front-end theater: `lib/demo-data.ts` scripts the workflows, `components/GraphCanvas.tsx` (xyflow + d3-force) renders the graph, `components/WorkflowSidebar.tsx` and `components/ResponsePanel.tsx` drive the scripted insight playback, `components/IntroTour.tsx` is the guided tour. No backend, no real data.
2. **The production system being built (on `spine`):** the real platform per `ARCHITECTURE.md` (north-star doc) and `plan/2026-06-12-spine-design.md` (approved phase-1 spec). Read the spec before touching spine work — it records the agreed decisions.

## Phase-1 architecture decisions (already made — do not relitigate)

- **Ontology-agnostic canonical layer.** No vertical is hardcoded in platform packages. Ontologies (entity/edge types as Zod schemas, triggers, traversal templates, resolution keys) are TypeScript packages: `packages/ontologies/<vertical>` are reusable bases; `customers/<id>` compose them via `composeOntology(base, {extend, override})`; a tenant registry maps `tenant_id → Ontology`. An `Ontology` is a value passed in — nothing imports a global one.
- **npm-workspaces monorepo, app stays at repo root.** Owned packages: `contracts` (shared types, zero deps), `ontology-core`, `graph` (the only package with SQL), `ingestion`, `engine`. Every package depends on `contracts`; no reaching into sibling internals.
- **Postgres (Neon) is the spine** — generic `entities`/`edges` (bitemporal)/`documents`/`chunks` tables, pgvector + Postgres FTS hybrid search, recursive-CTE traversals. No graph DB, no OpenSearch. ACL columns and `tenant_id` on every table and every query from the first migration.
- **Event flow:** append-only Postgres `events` table + dispatcher (cron route + manual "advance timeline" endpoint). `EventBus` is an interface in `contracts`. Replaying the event log against a modified ontology must always work.
- **Entity resolution is deterministic-only** (declared keys). Never let an LLM resolve entities at query time.
- **Agent runs:** trigger → traversal-template subgraph → AI SDK `generateObject` via AI Gateway. Every fact must cite node/document IDs present in the supplied subgraph — enforced in code (retry once, then mark run `degraded` and withhold the insight).
- **Synthetic data only** in phase 1: a seeded, deterministic ~90-day timeline with scripted incidents. No real connectors yet.

## Observability (first-class requirement)

Every pipeline stage must be traceable. OTel tracing via `@vercel/otel` exports to Langfuse; AI SDK `experimental_telemetry` captures each LLM call (prompt, completion, tokens, cost). Spans carry `tenant_id`, `signal_id`, `agent_run_id`. Structured logs include the active trace ID. The existing setup — `instrumentation.ts` ships OTel logs to PostHog, `lib/server-logger.ts` exposes the logger, PostHog client analytics in `instrumentation-client.ts` — must keep working alongside tracing. When adding pipeline code, add spans and structured logs as part of the work, not after.

## Conventions

- Specs/design docs live in `plan/` as dated markdown files; they are committed and treated as the source of truth for agreed decisions.
- Phase-1 explicitly defers: real connectors, probabilistic entity resolution, OpenFGA/SCIM/source-ACL mirroring, per-audience insight rendering, OpenSearch, Temporal/Inngest, graph databases. Don't introduce these early.
