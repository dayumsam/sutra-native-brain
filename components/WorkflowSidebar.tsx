"use client";

import { useState } from "react";
import { type Workflow } from "@/lib/demo-data";

type Status = "idle" | "received" | "running" | "synthesizing" | "complete";

type ListProps = {
  workflows: Workflow[];
  selectedId: string | null;
  status: Status;
  completedIds: string[];
  onRun: (wf: Workflow) => void;
  onCollapse?: () => void;
};

const isBusy = (status: Status) =>
  status === "received" || status === "running" || status === "synthesizing";

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={`h-3 w-3 animate-spin ${className}`} fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
      <path d="M10.5 6a4.5 4.5 0 00-4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function RailTooltip({ wf, done, selected }: { wf: Workflow; done: boolean; selected: boolean }) {
  return (
    <div
      className="pointer-events-none absolute left-full top-1/2 z-[9999] ml-3 w-52 -translate-y-1/2 overflow-hidden rounded-xl border border-line bg-card shadow-lg"
      style={{ filter: "drop-shadow(0 4px 16px rgba(28,25,55,0.14))" }}
    >
      <div className="border-b border-line-soft px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink">{wf.name}</span>
          {done && (
            <span className="flex items-center gap-1 rounded-full bg-green/10 px-2 py-0.5 text-[10px] font-semibold text-green">
              <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none">
                <path d="M2 5.5L4 7.5l4-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Done
            </span>
          )}
          {selected && !done && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
              Active
            </span>
          )}
        </div>
        <p className="mt-1 text-[11.5px] leading-snug text-ink-soft">{wf.description}</p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-line-soft px-0">
        <div className="px-3.5 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Records</div>
          <div className="mt-0.5 font-mono text-[12px] font-medium text-ink">{wf.retrieval.length}</div>
        </div>
        <div className="px-3.5 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Drafts</div>
          <div className="mt-0.5 font-mono text-[12px] font-medium text-ink">{wf.response.artifacts.length}</div>
        </div>
      </div>
      <div className="border-t border-line-soft px-3.5 py-2">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-faint">
          <span className="h-1.5 w-1.5 rounded-full bg-accent/60" />
          {wf.triggerSource}
        </span>
      </div>
    </div>
  );
}

/* Slim rail shown when the sidebar is collapsed — keeps step state visible */
export function WorkflowRail({
  workflows,
  selectedId,
  status,
  completedIds,
  onRun,
  onExpand,
}: Omit<ListProps, "onCollapse"> & { onExpand: () => void }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={onExpand}
        title="Expand workflows"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-card text-ink-faint shadow-sm transition-colors hover:text-ink-soft"
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
          <path
            d="M5.5 3L8.5 6L5.5 9M2.5 3L5.5 6L2.5 9"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className="mt-4 flex flex-col items-center gap-2">
        {workflows.map((wf, i) => {
          const selected = wf.id === selectedId;
          const busy = selected && isBusy(status);
          const done = completedIds.includes(wf.id);
          const hovered = hoveredId === wf.id;
          return (
            <div
              key={wf.id}
              className="relative"
              onMouseEnter={() => setHoveredId(wf.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <button
                onClick={() => onRun(wf)}
                disabled={busy}
                className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-[10.5px] font-semibold transition-colors ${
                  done
                    ? "bg-green/10 text-green"
                    : selected
                      ? "bg-accent-soft text-accent"
                      : "border border-line bg-card text-ink-faint hover:text-ink-soft"
                }`}
              >
                {busy ? (
                  <Spinner className="text-accent" />
                ) : done ? (
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                    <path
                      d="M2.5 6.5L5 9l4.5-6"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </button>
              {hovered && <RailTooltip wf={wf} done={done} selected={selected} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Numbered guided run-through with completion tracking */
export function GuidedWalkthrough({
  workflows,
  selectedId,
  status,
  completedIds,
  onRun,
  onCollapse,
}: ListProps) {
  const upNextId =
    workflows.find((wf) => !completedIds.includes(wf.id) && wf.id !== selectedId)?.id ?? null;

  return (
    <div>
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          Guided run-through
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[10.5px] text-ink-faint">
            {completedIds.length} of {workflows.length}
          </span>
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="Collapse panel"
              className="hidden h-5 w-5 items-center justify-center rounded text-ink-faint transition-colors hover:bg-line-soft hover:text-ink-soft lg:flex"
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                <path
                  d="M6.5 3L3.5 6L6.5 9M9.5 3L6.5 6L9.5 9"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </span>
      </div>

      <div className="mt-2.5 flex gap-1 px-1">
        {workflows.map((wf) => (
          <span
            key={wf.id}
            className={`h-[3px] flex-1 rounded-full transition-colors ${
              completedIds.includes(wf.id) ? "bg-accent" : "bg-line"
            }`}
          />
        ))}
      </div>

      <ol className="mt-3.5 space-y-1.5">
        {workflows.map((wf, i) => {
          const selected = wf.id === selectedId;
          const busy = selected && isBusy(status);
          const done = completedIds.includes(wf.id);
          const upNext = wf.id === upNextId && !selected;
          const emphasized = selected || upNext;
          return (
            <li key={wf.id}>
              <button
                onClick={() => onRun(wf)}
                disabled={busy}
                className={`w-full rounded-xl border px-3.5 py-3 text-left transition-all ${
                  selected
                    ? "border-accent/35 bg-accent-soft shadow-sm"
                    : upNext
                      ? "border-accent/35 bg-accent-soft shadow-sm"
                      : "border-transparent hover:border-line hover:bg-card"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10.5px] font-semibold ${
                      done
                        ? "bg-green/10 text-green"
                        : emphasized
                          ? "bg-accent-soft text-accent"
                          : "bg-line-soft text-ink-faint"
                    }`}
                  >
                    {done ? (
                      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                        <path
                          d="M2.5 6.5L5 9l4.5-6"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[13.5px] font-medium ${
                          emphasized || done ? "text-ink" : "text-ink-soft"
                        }`}
                      >
                        {wf.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[10.5px] font-semibold text-ink-faint">
                        {busy && <Spinner className="text-accent" />}
                        {busy
                          ? "Running"
                          : selected
                            ? "Viewing"
                            : done
                              ? "Viewed"
                              : upNext
                                ? "Up next"
                                : ""}
                      </span>
                    </div>
                    {emphasized && (
                      <div className="mt-1 text-[12px] leading-snug text-ink-soft">
                        {wf.description}
                      </div>
                    )}
                    {upNext && (
                      <div className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent">
                        Run this workflow
                        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                          <path
                            d="M4.5 3L7.5 6L4.5 9"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="mt-5 border-t border-line-soft px-1 pt-4 text-[12px] leading-relaxed text-ink-faint">
        Each run shows the agent reading Native&apos;s context graph before it drafts a response.
        Work through the four workflows in order, or jump to any of them.
      </p>
    </div>
  );
}
