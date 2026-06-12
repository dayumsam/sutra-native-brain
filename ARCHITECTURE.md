# Building a Production Context-Graph Intelligence System

How to take the Sutra demo — proactive analysis across an operational context graph — to production: ingestion from heterogeneous data sources, a typed context graph, permission-aware retrieval (RBAC), and a proactive analysis engine, in the spirit of Glean but vertical-specific.

---

## 0. What you're actually building (and what Glean got right)

A system like this has five subsystems, and they're separable enough to build in phases:

```
┌─────────────┐   ┌──────────────┐   ┌───────────────┐   ┌──────────────┐   ┌─────────┐
│  Ingestion   │──▶│ Normalization │──▶│ Context Graph │──▶│  Proactive    │──▶│ Serving │
│ (connectors) │   │ + entity res. │   │ + search index│   │  analysis     │   │ + UI    │
└─────────────┘   └──────────────┘   └───────────────┘   └──────────────┘   └─────────┘
        │                                     ▲
        └──────── ACL / identity sync ────────┘   (permissions are ingested data, not an afterthought)
```

The single most important lesson from Glean's architecture: **permissions are part of the data model from day one.** Glean's core innovation wasn't search quality — it was *permission-aware indexing*: every document in the index carries the principals allowed to see it, mirrored from the source system, and every query is filtered by the caller's resolved identity. Retrofitting this onto an existing index is close to a rewrite, so design it first even though it ships last in user-visible value.

The second lesson, specific to the demo: Glean is horizontal (documents, search). Sutra is vertical (manufacturing ops with typed entities — batches, lots, POs, complaint clusters). That's the advantage. A horizontal system has to infer structure; a vertical one can *declare* an ontology, which makes the graph, the reasoning, and the proactive triggers all dramatically more tractable. Don't build "Glean but smaller" — build "a typed operational graph with an analysis engine on top."

---

## 1. Ingestion layer

**Connector framework.** Each source (ERP, ticketing, email, IoT telemetry, QMS, WMS) gets a connector with a uniform contract:

- **Full sync** — initial backfill, paginated, checkpointed, resumable
- **Incremental sync** — webhooks where the source supports them (Zendesk, Slack, Gmail via push), polling with cursor/updated-at watermarks where it doesn't (most ERPs, NetSuite, SAP via OData)
- **ACL sync** — pulls *who can see what* alongside the content (see §4)
- **Tombstone handling** — deletions must propagate; a deleted source record that survives in your index is a compliance incident

Practical stack: run connectors as queue-driven workers. **Temporal** is genuinely the right tool here — connector syncs are long-running, retry-heavy, checkpoint-shaped workflows, and it saves you from hand-rolling all of that. For long-tail SaaS sources, buy instead of build: **Nango or Paragon** for auth + unified APIs, **Airbyte** for bulk ELT. Reserve custom connectors for the systems that matter most to the vertical (the ERP, the QMS, telemetry), because those need semantic fidelity off-the-shelf tools won't give you.

Everything lands on an **event bus** (Kafka or Redpanda; SQS+SNS is fine at smaller scale) as raw change events:

```json
{ "source": "...", "source_id": "...", "tenant_id": "...",
  "op": "upsert | delete", "payload": { }, "acl": { }, "observed_at": "..." }
```

Keep raw payloads in object storage (S3) so you can re-run normalization without re-crawling — you *will* change your ontology and need to replay.

**Telemetry is a different animal.** Device data (flow rates, TDS, filter health) is high-volume time series. Don't put it through the document pipeline — land it in a TSDB (Timescale/ClickHouse), and have the graph hold only *entities and derived signals* ("device D-4411", "anomaly: pump noise 3.2× baseline over 14 days"), not raw points.

## 2. Normalization and entity resolution

Raw events get transformed into a **canonical model** with three layers:

1. **Documents** — unstructured/semi-structured content (emails, tickets, memos, QC reports). Stored with full text, chunks, embeddings, metadata, ACL.
2. **Entities** — typed nodes from a declared ontology: `Product`, `Component`, `Supplier`, `SupplierLot`, `Batch`, `PurchaseOrder`, `ServiceTicket`, `ComplaintCluster`, `Device`, `WarrantyClaim`, `ChangeOrder`, `Technician`, `Site/City`. Each has a typed schema with required keys.
3. **Relationships** — typed edges: `Batch —USES_LOT→ SupplierLot`, `Device —BUILT_IN→ Batch`, `Ticket —ABOUT→ Device`, `PO —SUPPLIES→ Component`, `ChangeOrder —AFFECTS→ Component`.

**Entity resolution** is where most of these projects quietly fail. The same supplier appears as "AquaMotion Pvt Ltd" in the ERP, "aquamotion.in" in email, and "AQM" in QC sheets. Use a layered approach:

- **Deterministic first**: source-system foreign keys, SKUs, lot numbers, serial numbers, email domains. In a vertical system 80–90% of resolution is deterministic if you ingest the systems of record properly.
- **Probabilistic second**: blocking + fuzzy match (name similarity, shared attributes) for the remainder, with a human-review queue for low-confidence merges. Store merges as reversible (`same_as` edges with provenance), never destructive — bad merges are far more poisonous than missed ones.
- **Never let the LLM do silent entity resolution at query time.** It will confidently conflate Lot P-88A and P-88B.

## 3. Storage: the context graph

Contrarian but earned advice: **you probably don't need a graph database at first.**

- **Postgres** as the spine: `entities (id, tenant_id, type, key, properties jsonb)`, `edges (src, dst, type, properties, valid_from, valid_to)`, `documents`, `acl_entries`. With proper indexes, k-hop traversals over a few million edges via recursive CTEs are fine — and the proactive workflows mostly need 2–3 hop neighborhoods, not PageRank.
- **pgvector** (or a dedicated vector store later) for embeddings on document chunks *and* on entity "cards" — a rendered text summary of each entity; these make entity lookup by natural language work.
- **OpenSearch/Elasticsearch** for keyword/BM25 — hybrid retrieval (BM25 + vector + graph expansion) measurably beats either alone, especially for part numbers and lot codes, which embeddings handle badly.
- Move to Neo4j/Memgraph only when you have a demonstrated need: deep traversals (4+ hops), graph algorithms, or edge counts past ~10⁸. Migrating an edge table is easy; running two databases from day one is a tax.

**Bitemporality matters in ops.** Record both *when something was true* and *when you learned it*. "Warranty exposure was ₹X as of June 1" vs "we computed it June 8" is the difference between a defensible audit trail and a vibes dashboard. Cheap version: `valid_from/valid_to` on edges plus append-only snapshots of derived metrics.

## 4. Identity, RBAC, and permission-aware retrieval

This is the part to over-engineer. Two distinct permission systems compose:

### A. Source-mirrored ACLs (document-level)

Every ingested document carries the principals who can access it in the source system. Connectors sync ACLs (and group memberships) continuously. At query time, resolve the caller to their full principal set — user ID + all groups across all sources — and filter retrieval to documents whose ACL intersects that set. Key engineering points:

- **Identity stitching**: map `sam@native.com` in Google Workspace ↔ `smathew` in SAP ↔ Slack member ID into one canonical user. Drive this from your IdP via **SCIM** (Okta/Entra), and store per-source identity links.
- **Late binding**: filter at query time against current ACL state; don't bake permissions into the index. ACL sync lag is your exposure window — measure it, alert on it, and **fail closed** (a document with unknown/stale ACL state is invisible, not visible).
- ACL filtering must happen **in the retrieval engine** (a filter clause in the search/SQL query), never as post-filtering of LLM context. If a forbidden document ever enters the prompt, you've leaked it — the model will paraphrase it.

### B. Application RBAC (role/attribute-level)

Your own layer: a quality engineer sees CAPA workflows, a city ops manager sees their city's logistics, finance sees warranty exposure figures. Model as **RBAC + attribute scoping**: roles grant capabilities (`view_quality_signals`, `approve_deviation`), attributes scope them (`city = Bengaluru`, `product_line = M2`). For implementation, **OpenFGA** (open-source Zanzibar model) is the right shape — it natively handles "user → role → scoped resource" relationship tuples and stays fast at query time. Postgres RLS is a solid belt-and-suspenders beneath it.

### The proactive twist most people miss

In a search product, permissions answer "can this user see this result?" In a *proactive* product, you must also answer "**who should this insight be routed to, and what version of it can each recipient see?**" A quality-spike insight might cite supplier emails (visible to procurement), QC records (quality team), and warranty cost models (finance). Either generate per-audience renderings of the insight using only documents that audience can see, or route the full insight only to the intersection-cleared group. Decide this policy explicitly; it shapes the synthesis pipeline.

Plus the table stakes: tenant isolation enforced at the storage layer (every query carries `tenant_id`; consider DB-per-tenant for enterprise customers), immutable audit log of every retrieval and every insight delivery, encryption at rest with per-tenant keys if you go enterprise.

## 5. The proactive analysis engine

This is the product. Everything above is infrastructure. Split it into **detect → investigate → synthesize → route**, because each stage has different cost and reliability profiles.

### Detect (cheap, deterministic, always-on)

Triggers come in three kinds:

1. **Event triggers** — a new entity/edge of a watched type appears: supplier email classified as "delay", ECO filed, ticket opened. Implement as rules over the event bus.
2. **Threshold/anomaly detectors** — scheduled jobs over the metrics store: complaint rate per batch vs trailing baseline, stock-cover days below threshold, telemetry drift. Plain statistics (z-scores, EWMA, control charts — SPC is literally the native idiom of manufacturing quality) before any ML. The demo's "pump noise 3.2× increase" is a control-chart breach, not an AI problem.
3. **Graph-pattern detectors** — "complaint cluster + same supplier lot + lot still in open POs" as a standing graph query. These are the highest-value triggers and they fall directly out of having a typed graph.

Detectors emit cheap, structured **signals**, deduplicated and rate-limited (correlate by entity: 50 tickets on batch B-2231 = one signal, not 50).

### Investigate (the agentic part)

For each signal, extract the **relevant subgraph**: typed traversal templates per signal type (for a quality signal: batch → lot → supplier → open POs → affected devices → inventory → warranty model — exactly the `RetrievalStep` chain the demo fakes), plus hybrid search for related documents, all ACL-filtered for the *audience*, not the system. Cap the subgraph (token budgets are real); rank nodes by edge-type weight and recency.

### Synthesize

LLM call(s) with the subgraph rendered as structured context, producing **structured output matching the demo's schema** — `{headline, narrative, facts, recommendations[{action, why[]}], artifacts}` is genuinely a good production schema; keep it. Non-negotiables:

- **Every fact and every `why` carries citations** to node/document IDs from the provided subgraph. Reject (and retry or downgrade) any output citing nothing or citing IDs not in context.
- **A verifier pass** — second cheap model call or rule checks: do the numbers in `facts` match the source nodes? Are recommended actions within the playbook for this signal type? This is the difference between a tool ops people trust and one they mute in week two.
- Artifacts (email drafts, checklists, CAPA forms) are **drafts requiring human approval**, with the approval action logged. Autonomy can be earned per workflow later; start human-in-the-loop everywhere.

### Route

Map signal type + entity attributes → audience (the quality lead for that product line, the city ops manager for that city), apply the per-audience permission rendering from §4, dedupe against recently delivered insights, deliver to feed/Slack/email. **Capture feedback** (acted-on / dismissed / wrong) — it's both your eval set and eventually your ranking signal.

### Eval harness before scale-up

Golden set of historical incidents (in a vertical, customers can give you last year's quality escapes and supplier delays). Replay them through the pipeline and score: did we detect, was the traced root cause right, were the facts accurate? Run on every prompt/model/ontology change. Without this you cannot tell whether a change improved or degraded the system, and proactive systems die by silent degradation → false positives → muted notifications.

## 6. Serving and orchestration

- **LLM strategy**: cheap fast model for classification/triage of inbound events (Haiku-class), strong model for synthesis (Sonnet/Opus-class), structured outputs via tool-use/JSON schema everywhere. Route via a gateway (on Vercel, AI Gateway gives you fallbacks and spend tracking for free).
- **Interactive layer**: the same retrieval stack powers an ask-anything interface over the graph (the demo's workflows, but user-initiated). This is nearly free once the proactive stack exists, and it's how users build trust in the system's grounding.
- The Next.js app remains the front end; the ingestion/analysis backend wants to be a separate long-running service (workers + Temporal + Postgres), not Vercel functions — connector syncs and investigations exceed request/response shapes.

## 7. Build order

1. **Weeks 0–6 — Spine**: Postgres canonical model + ontology for ~8 entity types, 2 connectors (the ERP-ish system of record + one comms source), deterministic entity resolution, hybrid search, ACL columns present from the first migration even if the only ACL is "everyone in tenant."
2. **Weeks 6–12 — One killer workflow end-to-end**: pick *one* (quality signal → supplier lot trace is the demo's strongest), build its detectors, traversal template, synthesis with citations, and feed UI. One workflow that's right beats four that are plausible.
3. **Months 3–6 — Permissions + breadth**: SCIM/IdP integration, OpenFGA, source ACL mirroring, audit log; add connectors and the remaining three workflow families; eval harness on historical incidents.
4. **Months 6+ — Scale and intelligence**: anomaly detection beyond thresholds, per-audience insight rendering, feedback-driven ranking, graph DB only if traversal patterns demand it.

---

## The two hardest problems, named honestly

1. **Entity resolution quality** — the graph is only as good as its joins; budget real engineering here, not a weekend.
2. **Trust calibration of proactive output** — false-positive insights destroy the product faster than missed ones; verifier passes, citations, and conservative rate-limiting are product features, not polish.

Permissions are a lot of work but a known shape. These two are where the judgment lives.
