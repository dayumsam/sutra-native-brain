"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { GraphCanvas } from "@/components/GraphCanvas";
import { ResponsePanel } from "@/components/ResponsePanel";
import { GuidedWalkthrough, WorkflowRail } from "@/components/WorkflowSidebar";
import { WORKFLOWS, COPY, type Workflow } from "@/lib/demo-data";

const TRIGGER_MS = 700; // the trigger "arrives" before the agent reacts
const CONNECT_MS = 350;
const STEP_MS = 420;
const SYNTHESIS_MS = 800;
// deterministic ±130ms jitter so reads don't tick like a metronome
const jitter = (i: number) => ((i * 7919 + 251) % 261) - 130;

export type RunStatus = "idle" | "received" | "running" | "synthesizing" | "complete";

export default function Home() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [revealedSteps, setRevealedSteps] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [runId, setRunId] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const graphSectionRef = useRef<HTMLElement>(null);

  const workflow = WORKFLOWS.find((w) => w.id === selectedId) ?? null;
  const activeNodeIds = workflow
    ? workflow.retrieval.slice(0, revealedSteps).map((s) => s.nodeId)
    : [];

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const run = useCallback(
    (wf: Workflow) => {
      clearTimers();
      setSelectedId(wf.id);
      setStatus("received");
      setRevealedSteps(0);
      setRunId((id) => id + 1);
      setSidebarCollapsed(true);

      // On mobile, scroll graph into view so the animation is immediately visible
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        requestAnimationFrame(() => {
          graphSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }

      timers.current.push(setTimeout(() => setStatus("running"), TRIGGER_MS));
      const stepAt = (i: number) => TRIGGER_MS + CONNECT_MS + i * STEP_MS + jitter(i);
      wf.retrieval.forEach((_, i) => {
        timers.current.push(setTimeout(() => setRevealedSteps(i + 1), stepAt(i)));
      });
      const readDone = stepAt(wf.retrieval.length - 1) + STEP_MS;
      timers.current.push(setTimeout(() => setStatus("synthesizing"), readDone));
      timers.current.push(
        setTimeout(() => {
          setStatus("complete");
          setCompletedIds((ids) => (ids.includes(wf.id) ? ids : [...ids, wf.id]));
        }, readDone + SYNTHESIS_MS)
      );
    },
    [clearTimers]
  );

  const focusNodeIds = workflow ? workflow.retrieval.map((s) => s.nodeId) : [];
  const nextWorkflow = WORKFLOWS.find((w) => !completedIds.includes(w.id)) ?? null;

  return (
    <main className="flex min-h-screen flex-col lg:h-screen">
      {/* Header */}
      <header className="flex h-[54px] shrink-0 items-center gap-3 border-b border-line bg-card px-4 sm:px-5">
        <span className="text-[16px] font-semibold tracking-tight text-ink">{COPY.product}</span>
        <span className="hidden h-4 w-px bg-line sm:block" />
        <span className="hidden text-[13px] text-ink-soft sm:inline">{COPY.title}</span>
        <div className="ml-auto flex items-center gap-2.5">
          <span className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-ink-faint">
            Demo data
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Workflow list — collapses to a slim rail on desktop */}
        <aside
          className={`w-full shrink-0 border-b border-line bg-paper p-4 scrollbar-thin transition-[width] duration-300 ease-out sm:p-5 lg:border-b-0 lg:border-r ${
            sidebarCollapsed
              ? "z-10 lg:w-[60px] lg:overflow-visible lg:px-3 lg:py-4"
              : "lg:w-[320px] lg:overflow-y-auto"
          }`}
        >
          {/* The rail only applies at desktop width; mobile keeps the full list */}
          <div className={sidebarCollapsed ? "lg:hidden" : ""}>
            <GuidedWalkthrough
              workflows={WORKFLOWS}
              selectedId={selectedId}
              status={status}
              completedIds={completedIds}
              onRun={run}
              onCollapse={() => setSidebarCollapsed(true)}
            />
          </div>
          {sidebarCollapsed && (
            <div className="hidden lg:block">
              <WorkflowRail
                workflows={WORKFLOWS}
                selectedId={selectedId}
                status={status}
                completedIds={completedIds}
                onRun={run}
                onExpand={() => setSidebarCollapsed(false)}
              />
            </div>
          )}
        </aside>

        {/* Graph canvas */}
        <section ref={graphSectionRef} className="h-[360px] min-w-0 shrink-0 bg-paper p-3 sm:h-[440px] lg:h-auto lg:flex-1">
          <div className="relative h-full overflow-hidden rounded-2xl border border-[#2a2740] shadow-[0_8px_30px_rgba(28,25,55,0.18)]">
            <GraphCanvas
              activeNodeIds={activeNodeIds}
              focusNodeIds={focusNodeIds}
              hasRun={revealedSteps > 0}
            />
            {!selectedId && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="mx-4 flex max-w-[210px] flex-col items-center gap-3 rounded-2xl border border-[#3a3660] bg-[#16142a]/80 px-5 py-5 text-center backdrop-blur-md"
                  style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.45)" }}
                >
                  <div className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6e62e8] opacity-50" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#6e62e8]" />
                  </div>
                  <p className="text-[13px] leading-snug text-[#c4c0e8]">
                    Select a workflow from the list to watch the agent read from the graph in real time
                  </p>
                  <span className="text-[10.5px] font-medium text-[#6e62e8]/70">
                    Pick one from the sidebar
                  </span>
                </motion.div>
              </div>
            )}
          </div>
        </section>

        {/* Response */}
        {workflow && (
          <section
            className={`w-full shrink-0 border-t border-line bg-paper transition-[width] duration-500 ease-out lg:border-t-0 lg:border-l ${
              status === "idle" ? "lg:w-[440px]" : "lg:w-[560px] xl:w-[640px]"
            }`}
          >
            <ResponsePanel
              workflow={workflow}
              status={status}
              revealedSteps={revealedSteps}
              runId={runId}
              nextWorkflow={nextWorkflow}
              onNextWorkflow={() => nextWorkflow && run(nextWorkflow)}
            />
          </section>
        )}
      </div>
    </main>
  );
}
