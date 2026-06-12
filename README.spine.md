# Spine — running the phase-1 testbed

The `spine` branch adds the real platform behind the demo: a modular,
ontology-agnostic context graph with trigger-driven agent runs. Spec:
`plan/2026-06-12-spine-design.md` · Plan: `plan/2026-06-12-spine-implementation-plan.md`.

**Never merge to `main` without explicit approval — `main` serves production.**

## Environment (dev / Vercel Preview only)

Copy `.env.example` → `.env.local` and fill in:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Neon Postgres (Vercel Marketplace → Neon → create a **branch database** for spine) |
| `AI_GATEWAY_API_KEY` | Vercel dashboard → AI Gateway |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | https://cloud.langfuse.com (free tier) — tracing no-ops when unset |
| `DATA_MODE` | `graph` to enable the spine; unset/`demo` = scripted demo only |
| `LOG_LEVEL` | `debug` for verbose pipeline logs |

Set the same variables in Vercel as **Preview-environment** variables only.
Production gets none of them; with `DATA_MODE` unset the build is byte-identical
to `main` (the `/` page stays static, `/spine` and `/api/spine/*` return 404).

Schema migrations apply automatically (idempotent) the first time the spine
initializes — no separate migrate step.

## Driving the simulation

```bash
npm run dev   # with DATA_MODE=graph in .env.local
```

Open **/spine**:

1. **Reset database** — wipe data, keep schema.
2. **Advance timeline** to day 70 — feeds the seeded 90-day synthetic timeline
   day by day with a dispatcher tick per day, then executes the queued agent runs.
   The scripted incidents land at: day 60 supplier-delay email, day 65 telemetry
   drift, day ~62 quality spike threshold, day 68 complaint cluster → lot exposure.
3. Watch the runs table: each run shows its steps (investigate → synthesize →
   verify → route), token usage, and trace id.
4. Open **/** — the home page now renders live insights from the graph
   (badge says "Live context graph"; falls back to the scripted demo while the
   graph is empty).

Or from the terminal:

```bash
curl -X POST localhost:3000/api/spine/advance -d '{"toDay":70}' -H 'content-type: application/json'
curl localhost:3000/api/spine/insights | jq '.insights[].content.headline'
```

## Reading a trace (Langfuse)

One trace per dispatcher tick (`engine.tick`) and one per agent run
(`agent.run`). Inside an agent-run trace: `investigate.subgraph` (node/edge/doc
counts, cap flag) → `synthesize.llm` per attempt (full prompt, completion,
tokens, cost via AI SDK telemetry) → `verify.facts` → graph spans
(`graph.traverse`, `graph.search`) nested where they happened. Spans carry
`tenant.id`, `signal.id`, `agent_run.id`. Set
`NEXT_PUBLIC_LANGFUSE_TRACE_URL_PREFIX` to your project's trace URL prefix to
get clickable links in /spine.

## Tests

```bash
npm test            # all packages, PGlite (no Docker, no cloud)
npm run typecheck   # per-package tsc
```

The load-bearing one is `packages/engine/test/e2e-timeline.test.ts`: replays the
timeline through the full pipeline and asserts the quality spike fires exactly
once, its subgraph contains the batch → lot → supplier → open-PO chain, and the
insight's citations resolve. LLM calls are deterministic fakes in CI; real
models run only in dev (AI Gateway).
