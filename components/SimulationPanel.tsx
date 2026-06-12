"use client";

import { useCallback, useEffect, useState } from "react";

type SubgraphNode = { id: string; type: string; key: string; card_text: string };
type SubgraphEdge = { id: string; type: string; src: string; dst: string };

type Run = {
  id: string;
  status: string;
  trigger_key: string;
  severity: string;
  trace_id: string | null;
  tokens_in: number;
  tokens_out: number;
  error: string | null;
  steps: Array<{ stage: string; detail: Record<string, unknown> }>;
  subgraph_snapshot: { nodes: SubgraphNode[]; edges: SubgraphEdge[]; capped?: boolean } | null;
  created_at: string;
};

// The subgraph an agent run actually worked on, rendered from its snapshot —
// every node here was in the model's context and is citable by id.
function SubgraphView({ snapshot }: { snapshot: NonNullable<Run["subgraph_snapshot"]> }) {
  const byId = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const byType = new Map<string, SubgraphNode[]>();
  for (const node of snapshot.nodes) {
    byType.set(node.type, [...(byType.get(node.type) ?? []), node]);
  }
  return (
    <div className="mt-2 space-y-2 rounded border border-line/50 bg-paper/50 p-3">
      <p className="text-xs font-semibold text-ink-soft">
        Subgraph in context: {snapshot.nodes.length} nodes, {snapshot.edges.length} edges
        {snapshot.capped ? " (capped)" : ""}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {[...byType.entries()].map(([type, nodes]) => (
          <details key={type}>
            <summary className="cursor-pointer text-accent">
              {type} × {nodes.length}
            </summary>
            <ul className="ml-3 list-disc text-ink-faint">
              {nodes.map((n) => (
                <li key={n.id} title={n.id}>
                  {n.card_text}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-ink-faint">
          relationships ({snapshot.edges.length})
        </summary>
        <ul className="ml-3 text-xs text-ink-faint">
          {snapshot.edges.map((e) => (
            <li key={e.id}>
              {byId.get(e.src)?.card_text ?? e.src} —{e.type}→ {byId.get(e.dst)?.card_text ?? e.dst}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

type Insight = {
  id: string;
  trigger_key: string;
  created_at: string;
  content: { headline: string; facts: Array<{ text: string; citations: string[] }> };
};

const STATUS_COLOR: Record<string, string> = {
  completed: "text-emerald-400",
  pending: "text-amber-300",
  running: "text-sky-300",
  degraded: "text-orange-400",
  failed: "text-red-400",
};

export function SimulationPanel() {
  const [day, setDay] = useState(70);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);

  const note = (msg: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} ${msg}`, ...l].slice(0, 30));

  const refresh = useCallback(async () => {
    const [runsRes, insightsRes] = await Promise.all([
      fetch("/api/spine/runs").then((r) => r.json()),
      fetch("/api/spine/insights").then((r) => r.json()),
    ]);
    setRuns(runsRes.runs ?? []);
    setInsights(insightsRes.insights ?? []);
  }, []);

  useEffect(() => {
    // Initial data load; state updates land asynchronously after the fetch.
    const id = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(id);
  }, [refresh]);

  const act = async (label: string, path: string, body?: object) => {
    setBusy(label);
    note(`${label}…`);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      note(`${label}: ${res.ok ? JSON.stringify(json).slice(0, 180) : `HTTP ${res.status}`}`);
      await refresh();
    } catch (error) {
      note(`${label} failed: ${String(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const traceUrlPrefix = process.env.NEXT_PUBLIC_LANGFUSE_TRACE_URL_PREFIX;

  return (
    <main className="min-h-screen bg-paper p-6 text-ink">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Spine simulation</h1>
          <span className="text-sm text-ink-faint">
            synthetic timeline → triggers → agent runs → insights
          </span>
        </header>

        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-4">
          <label className="flex items-center gap-2 text-sm">
            Advance to day
            <input
              type="number"
              min={0}
              max={90}
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              className="w-20 rounded border border-line bg-paper px-2 py-1"
            />
          </label>
          <button
            disabled={busy !== null}
            onClick={() => act(`advance→${day}`, "/api/spine/advance", { toDay: day })}
            className="rounded-full border border-accent/50 px-4 py-1.5 text-sm hover:bg-accent/10 disabled:opacity-50"
          >
            Advance timeline
          </button>
          <button
            disabled={busy !== null}
            onClick={() => act("tick", "/api/spine/tick")}
            className="rounded-full border border-line px-4 py-1.5 text-sm hover:border-accent/40 disabled:opacity-50"
          >
            Tick
          </button>
          <button
            disabled={busy !== null}
            onClick={() => act("reset", "/api/spine/reset")}
            className="rounded-full border border-red-400/40 px-4 py-1.5 text-sm text-red-300 hover:bg-red-400/10 disabled:opacity-50"
          >
            Reset database
          </button>
          <button
            onClick={() => {
              note("refresh");
              void refresh();
            }}
            className="rounded-full border border-line px-4 py-1.5 text-sm hover:border-accent/40"
          >
            Refresh
          </button>
          {busy && <span className="text-sm text-ink-faint">working: {busy}</span>}
        </section>

        <section className="rounded-xl border border-line bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink-soft">
            Agent runs ({runs.length})
          </h2>
          <div className="space-y-2">
            {runs.map((run) => (
              <details key={run.id} className="rounded-lg border border-line/60 p-3 text-sm">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                  <span className={STATUS_COLOR[run.status] ?? ""}>{run.status}</span>
                  <span className="font-medium">{run.trigger_key}</span>
                  <span className="text-ink-faint">
                    {run.tokens_in + run.tokens_out} tokens
                  </span>
                  {run.trace_id &&
                    (traceUrlPrefix ? (
                      <a
                        href={`${traceUrlPrefix}${run.trace_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline"
                      >
                        trace ↗
                      </a>
                    ) : (
                      <code className="text-xs text-ink-faint">{run.trace_id}</code>
                    ))}
                </summary>
                {run.subgraph_snapshot && <SubgraphView snapshot={run.subgraph_snapshot} />}
                <pre className="mt-2 overflow-x-auto text-xs text-ink-faint">
                  {JSON.stringify(run.steps, null, 2)}
                </pre>
                {run.error && <p className="mt-1 text-xs text-red-300">{run.error}</p>}
              </details>
            ))}
            {runs.length === 0 && (
              <p className="text-sm text-ink-faint">
                No runs yet — advance the timeline to day 70 to play the scripted incidents.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-line bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink-soft">
            Insights ({insights.length})
          </h2>
          <div className="space-y-2">
            {insights.map((insight) => (
              <div key={insight.id} className="rounded-lg border border-line/60 p-3 text-sm">
                <p className="font-medium">{insight.content.headline}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {insight.trigger_key} · {insight.content.facts.length} cited facts
                </p>
              </div>
            ))}
            {insights.length === 0 && (
              <p className="text-sm text-ink-faint">No insights yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-line bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink-soft">Activity</h2>
          <pre className="max-h-48 overflow-y-auto text-xs text-ink-faint">
            {log.join("\n") || "—"}
          </pre>
        </section>
      </div>
    </main>
  );
}
