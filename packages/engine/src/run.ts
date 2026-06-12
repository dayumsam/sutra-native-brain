import { trace } from "@opentelemetry/api";
import { sql } from "drizzle-orm";
import { getLogger, withSpan, type InsightContent, type Signal } from "@sutra/contracts";
import type { Embedder } from "@sutra/graph";
import { investigate } from "./investigate";
import { getOrCreateSessionId } from "./session";
import { checkCitations } from "./verify";
import { SYNTHESIS_SYSTEM_PROMPT, type Synthesizer, type Verifier } from "./synthesize";
import type { EngineDeps } from "./dispatcher";

const log = getLogger("engine.run");

export type RunDeps = EngineDeps & {
  embedder: Embedder;
  synthesizer: Synthesizer;
  verifier: Verifier;
};

type Step = { stage: string; at: string; detail: Record<string, unknown> };

async function loadSignal(deps: RunDeps, signalId: string): Promise<Signal> {
  const result = await deps.db.execute(sql`SELECT * FROM signals WHERE id = ${signalId}`);
  if (!result.rows[0]) throw new Error(`Signal ${signalId} not found`);
  return result.rows[0] as Signal;
}

// detect → investigate → synthesize → verify → route, recorded step by step
// in agent_runs so a run can be reconstructed without any external tool.
// Each run is its own root trace, grouped with the rest of the simulation
// epoch into one Langfuse session.
export async function executeAgentRun(deps: RunDeps, runId: string): Promise<string> {
  const runRow = await deps.db.execute(sql`SELECT * FROM agent_runs WHERE id = ${runId}`);
  const run = runRow.rows[0] as
    | { id: string; tenant_id: string; signal_id: string; status: string }
    | undefined;
  if (!run) throw new Error(`Agent run ${runId} not found`);
  if (run.status !== "pending") return run.status;
  const sessionId = await getOrCreateSessionId(deps.db, run.tenant_id);

  return withSpan(
    "agent.run",
    { "agent_run.id": runId, "langfuse.session.id": sessionId },
    async (setAttributes) => {
    const ctx = { tenantId: run.tenant_id };
    const ontology = deps.registry.get(run.tenant_id);
    const signal = await loadSignal(deps, run.signal_id);
    const traceId = trace.getActiveSpan()?.spanContext().traceId ?? null;
    setAttributes({ "tenant.id": run.tenant_id, "signal.id": signal.id, "trigger.key": signal.trigger_key });

    const steps: Step[] = [];
    let tokensIn = 0;
    let tokensOut = 0;
    const stamp = (stage: string, detail: Record<string, unknown>) =>
      steps.push({ stage, at: new Date().toISOString(), detail });

    const update = (fields: Record<string, unknown>) =>
      deps.db.execute(sql`
        UPDATE agent_runs SET
          status = ${String(fields.status)},
          steps = ${JSON.stringify(steps)}::jsonb,
          subgraph_snapshot = ${fields.snapshot ? JSON.stringify(fields.snapshot) : null}::jsonb,
          trace_id = ${traceId},
          tokens_in = ${tokensIn}, tokens_out = ${tokensOut},
          error = ${(fields.error as string | null) ?? null},
          updated_at = now()
        WHERE id = ${runId}
      `);

    try {
      await deps.db.execute(
        sql`UPDATE agent_runs SET status = 'running', updated_at = now() WHERE id = ${runId}`,
      );

      // Investigate
      const investigation = await investigate(deps.db, deps.embedder, ctx, ontology, signal);
      stamp("investigate", {
        nodes: investigation.subgraph.nodes.length,
        edges: investigation.subgraph.edges.length,
        documents: investigation.documents.length,
        capped: investigation.subgraph.capped,
      });

      // Synthesize, with one retry on citation violations.
      let content: InsightContent | null = null;
      let lastProblems: string[] = [];
      for (let attempt = 1; attempt <= 2 && !content; attempt++) {
        const retryNote =
          attempt === 1
            ? ""
            : `\n\nYour previous answer was rejected for invalid citations:\n- ${lastProblems.join(
                "\n- ",
              )}\nCite only bracketed ids from the context.`;
        const result = await withSpan(
          "synthesize.llm",
          { "synthesize.attempt": attempt, "signal.id": signal.id },
          () =>
            deps.synthesizer.synthesize({
              system: SYNTHESIS_SYSTEM_PROMPT,
              prompt: investigation.contextText + retryNote,
            }),
        );
        tokensIn += result.tokensIn;
        tokensOut += result.tokensOut;

        const check = checkCitations(result.content, investigation.citableIds);
        if (check.valid) {
          content = check.content;
          stamp("synthesize", { attempt, tokensIn: result.tokensIn, tokensOut: result.tokensOut });
        } else {
          lastProblems = check.problems;
          stamp("citation_check_failed", { attempt, problems: check.problems.slice(0, 10) });
          log.warn({ run_id: runId, attempt, problems: check.problems }, "citation check failed");
        }
      }

      if (!content) {
        // Degraded: the insight is withheld rather than delivered uncited.
        await update({ status: "degraded", snapshot: investigation.subgraph, error: "citation check failed twice" });
        return "degraded";
      }

      // Verifier pass (cheap model) — result recorded, delivery proceeds.
      const verdict = await withSpan("verify.facts", { "signal.id": signal.id }, () =>
        deps.verifier.verify({
          prompt:
            `CONTEXT:\n${investigation.contextText}\n\n` +
            `GENERATED INSIGHT:\n${JSON.stringify(content, null, 2)}`,
        }),
      );
      tokensIn += verdict.tokensIn;
      tokensOut += verdict.tokensOut;
      stamp("verify", { ok: verdict.ok, notes: verdict.notes });

      // Route (phase 1: whole tenant), deduped per signal.
      const existing = await deps.db.execute(sql`
        SELECT id FROM insights WHERE signal_id = ${signal.id} AND status != 'superseded'
      `);
      if (existing.rows.length === 0) {
        await deps.db.execute(sql`
          INSERT INTO insights (tenant_id, signal_id, agent_run_id, status, content)
          VALUES (${run.tenant_id}, ${signal.id}, ${runId}, 'new',
                  ${JSON.stringify({ ...content, verifier: { ok: verdict.ok, notes: verdict.notes } })}::jsonb)
        `);
        stamp("route", { delivered: true });
      } else {
        stamp("route", { delivered: false, reason: "insight already exists for signal" });
      }

      await update({ status: "completed", snapshot: investigation.subgraph, error: null });
      log.info({ run_id: runId, trigger: signal.trigger_key, tokensIn, tokensOut }, "agent run completed");
      return "completed";
    } catch (error) {
      stamp("error", { message: String(error) });
      await update({ status: "failed", snapshot: null, error: String(error) });
      log.error({ run_id: runId, error: String(error) }, "agent run failed");
      return "failed";
    }
    },
    { root: true },
  );
}

/** Execute every pending run (the dispatcher's follow-up work). */
export async function executePendingRuns(deps: RunDeps): Promise<Record<string, string>> {
  const pending = await deps.db.execute(
    sql`SELECT id FROM agent_runs WHERE status = 'pending' ORDER BY created_at`,
  );
  const outcomes: Record<string, string> = {};
  for (const row of pending.rows) {
    const id = (row as { id: string }).id;
    outcomes[id] = await executeAgentRun(deps, id);
  }
  return outcomes;
}
