"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { type Workflow, type Artifact } from "@/lib/demo-data";

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={`h-3 w-3 animate-spin ${className}`} fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
      <path
        d="M10.5 6a4.5 4.5 0 00-4.5-4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
      {children}
    </div>
  );
}

function KindTag({
  icon,
  label,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}

const MailIcon = (
  <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="1.5" y="3" width="11" height="8" rx="1.5" />
    <path d="M2 4l5 4 5-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TaskIcon = (
  <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="2" y="2" width="10" height="10" rx="2.5" />
    <path d="M4.8 7.2L6.4 8.8L9.4 5.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChecklistIcon = (
  <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.2">
    <path d="M2 3.5l1 1 1.8-2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 8.5l1 1 1.8-2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 4h5M7 9h5" strokeLinecap="round" />
  </svg>
);

const MemoIcon = (
  <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.2">
    <path d="M3.5 1.5h5L11 4v8.5h-7.5z" strokeLinejoin="round" />
    <path d="M5.5 6.5h3.5M5.5 9h3.5" strokeLinecap="round" />
  </svg>
);

function GhostButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="rounded-md border border-line bg-card px-3 py-1 text-[11.5px] font-medium text-ink-soft transition-colors hover:bg-line-soft"
    >
      {children}
    </button>
  );
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="rounded-md bg-accent px-3 py-1 text-[11.5px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
    >
      {children}
    </button>
  );
}

function EmailArtifact({ artifact }: { artifact: Artifact }) {
  const recipient = (artifact.meta ?? "").replace(/^To:\s*/i, "") || "—";
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-line-soft bg-paper/70 px-4 py-2">
        <KindTag icon={MailIcon} label="Email draft" className="text-accent" />
        <span className="text-[10.5px] font-medium text-ink-faint">Not sent</span>
      </div>
      <div className="grid grid-cols-[58px_1fr] gap-y-1.5 border-b border-line-soft px-4 py-3 text-[12px]">
        <span className="text-ink-faint">From</span>
        <span className="text-ink-soft">Sutra Agent</span>
        <span className="text-ink-faint">To</span>
        <span className="text-ink-soft">{recipient}</span>
        <span className="text-ink-faint">Subject</span>
        <span className="font-medium text-ink">{artifact.title}</span>
      </div>
      <div className="space-y-2.5 px-4 py-3.5">
        {artifact.lines.map((line) => (
          <p key={line} className="text-[12.5px] leading-relaxed text-ink-soft">
            {line}
          </p>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-line-soft bg-paper/70 px-4 py-2.5">
        <PrimaryButton>Send</PrimaryButton>
        <GhostButton>Edit draft</GhostButton>
        <span className="ml-auto text-[11px] text-ink-faint">Awaiting your review</span>
      </div>
    </div>
  );
}

function TaskArtifact({ artifact }: { artifact: Artifact }) {
  const metaParts = (artifact.meta ?? "").split(" · ").filter(Boolean);
  const needsApproval = metaParts.some((p) => /approval/i.test(p));
  const owner = metaParts.filter((p) => !/approval/i.test(p)).join(" · ");
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-line-soft bg-paper/70 px-4 py-2">
        <KindTag icon={TaskIcon} label="Task" className="text-amber" />
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            needsApproval ? "bg-amber/10 text-amber" : "bg-green/10 text-green"
          }`}
        >
          {needsApproval ? "Needs approval" : "Ready to create"}
        </span>
      </div>
      <div className="border-b border-line-soft px-4 py-3">
        <div className="text-[13px] font-semibold leading-snug text-ink">{artifact.title}</div>
        {owner && (
          <div className="mt-1 text-[11.5px] text-ink-faint">
            Assigned to <span className="font-medium text-ink-soft">{owner}</span>
          </div>
        )}
      </div>
      <ul>
        {artifact.lines.map((line, i) => (
          <li
            key={line}
            className={`flex gap-2.5 px-4 py-2.5 text-[12.5px] leading-snug text-ink-soft ${
              i > 0 ? "border-t border-line-soft" : ""
            }`}
          >
            <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-[4px] border border-line bg-paper" />
            {line}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 border-t border-line-soft bg-paper/70 px-4 py-2.5">
        <PrimaryButton>{needsApproval ? "Approve & create" : "Create task"}</PrimaryButton>
        <GhostButton>Edit</GhostButton>
        <span className="ml-auto font-mono text-[10.5px] text-ink-faint">
          {artifact.lines.length} item{artifact.lines.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

function ChecklistArtifact({ artifact }: { artifact: Artifact }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-line-soft bg-paper/70 px-4 py-2">
        <KindTag icon={ChecklistIcon} label="Checklist" className="text-green" />
        <span className="font-mono text-[10.5px] text-ink-faint">
          0 of {artifact.lines.length} complete
        </span>
      </div>
      <div className="border-b border-line-soft px-4 py-3">
        <div className="text-[13px] font-semibold leading-snug text-ink">{artifact.title}</div>
        {artifact.meta && <div className="mt-1 text-[11.5px] text-ink-faint">{artifact.meta}</div>}
      </div>
      <ul>
        {artifact.lines.map((line, i) => (
          <li
            key={line}
            className={`flex gap-2.5 px-4 py-2.5 text-[12.5px] leading-snug text-ink-soft ${
              i > 0 ? "border-t border-line-soft" : ""
            }`}
          >
            <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-[4px] border border-line bg-paper" />
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Memo lines like "Problem: ..." render as labeled rows; anything else as a paragraph.
const MEMO_LABEL = /^([A-Z][A-Za-z ]{1,16}):\s+(.+)$/;

function MemoArtifact({ artifact }: { artifact: Artifact }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-line-soft bg-paper/70 px-4 py-2">
        <KindTag icon={MemoIcon} label="Memo" className="text-ink-soft" />
        <span className="text-[10.5px] font-medium text-ink-faint">Draft</span>
      </div>
      <div className="border-b border-line-soft px-4 py-3">
        <div className="font-serif text-[14px] font-semibold leading-snug tracking-tight text-ink">
          {artifact.title}
        </div>
        {artifact.meta && <div className="mt-1 text-[11.5px] text-ink-faint">{artifact.meta}</div>}
      </div>
      <div className="px-4 py-3">
        {artifact.lines.map((line, i) => {
          const match = line.match(MEMO_LABEL);
          return match ? (
            <div
              key={line}
              className={`flex gap-3 py-2 text-[12.5px] leading-snug ${
                i > 0 ? "border-t border-line-soft" : ""
              }`}
            >
              <span className="w-[88px] shrink-0 text-[10.5px] font-semibold uppercase tracking-wide leading-[1.7] text-ink-faint">
                {match[1]}
              </span>
              <span className="text-ink-soft">{match[2]}</span>
            </div>
          ) : (
            <p
              key={line}
              className={`py-2 text-[12.5px] leading-relaxed text-ink-soft ${
                i > 0 ? "border-t border-line-soft" : ""
              }`}
            >
              {line}
            </p>
          );
        })}
      </div>
    </div>
  );
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  switch (artifact.kind) {
    case "Email draft":
      return <EmailArtifact artifact={artifact} />;
    case "Task":
      return <TaskArtifact artifact={artifact} />;
    case "Checklist":
      return <ChecklistArtifact artifact={artifact} />;
    case "Memo":
      return <MemoArtifact artifact={artifact} />;
  }
}

type Props = {
  workflow: Workflow | null;
  status: "idle" | "received" | "running" | "synthesizing" | "complete";
  revealedSteps: number;
  runId: number;
};

export function ResponsePanel({ workflow, status, revealedSteps, runId }: Props) {
  const [openWhy, setOpenWhy] = useState<string | null>(null);
  // The log collapses by default once the run completes; the user can override
  // by toggling, and the override resets whenever the run state changes.
  const [logOverride, setLogOverride] = useState<boolean | null>(null);
  const [lastRunState, setLastRunState] = useState<string>("");

  const runState = `${workflow?.id}:${status}`;
  if (runState !== lastRunState) {
    setLastRunState(runState);
    setLogOverride(null);
  }

  if (!workflow) return null;

  const logCollapsed = logOverride ?? status === "complete";

  const steps = workflow.retrieval.slice(0, revealedSteps);
  const done = status === "complete";

  return (
    <div className="p-4 scrollbar-thin sm:p-5 lg:h-full lg:overflow-y-auto">
      {/* Trigger — arrives like a live notification, then the agent reacts */}
      <motion.div
        key={runId}
        initial={{ opacity: 0, y: -14, scale: 0.985 }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
          boxShadow: [
            "0 0 0 0px rgba(110, 98, 232, 0)",
            "0 0 0 4px rgba(110, 98, 232, 0.18)",
            "0 0 0 0px rgba(110, 98, 232, 0)",
          ],
        }}
        transition={{
          duration: 0.45,
          ease: [0.16, 1, 0.3, 1],
          boxShadow: { duration: 1.1, times: [0, 0.35, 1], delay: 0.15 },
        }}
        className="rounded-xl border border-line bg-card px-4 py-3.5 shadow-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex rounded-full bg-accent-soft px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-accent">
            {workflow.triggerSource}
          </span>
          <span className="flex items-center gap-1.5 text-[10.5px] text-ink-faint">
            <span className="relative flex h-1.5 w-1.5">
              {status === "received" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              )}
              <span
                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                  status === "received" ? "bg-accent" : "bg-ink-faint/50"
                }`}
              />
            </span>
            Just now
          </span>
        </div>
        <p className="mt-2 text-[14px] font-medium leading-snug text-ink">{workflow.trigger}</p>
      </motion.div>

      {/* Retrieval log — appears once the agent picks the trigger up */}
      {status !== "received" && (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mt-6"
      >
        <button
          onClick={() => setLogOverride(!logCollapsed)}
          className="flex w-full items-center justify-between rounded-md px-1 py-0.5 text-left transition-colors hover:bg-line-soft/60"
        >
          <div className="flex items-center gap-2">
            {status === "running" ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
            ) : (
              <svg viewBox="0 0 12 12" className="h-3 w-3 text-green" fill="none">
                <path
                  d="M2.5 6.5L5 9l4.5-6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            <SectionLabel>
              {status === "running" ? "Reading from the context graph" : "Read from the context graph"}
            </SectionLabel>
          </div>
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-[10.5px] text-ink-faint">
              {steps.length}/{workflow.retrieval.length}
            </span>
            <svg
              viewBox="0 0 12 12"
              className={`h-3 w-3 text-ink-faint transition-transform duration-200 ${
                logCollapsed ? "" : "rotate-180"
              }`}
              fill="none"
            >
              <path
                d="M3 4.5L6 7.5L9 4.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
        <AnimatePresence initial={false}>
          {!logCollapsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-2.5 overflow-hidden rounded-xl border border-line bg-card shadow-sm">
                {steps.map((step, i) => (
                  <motion.div
                    key={step.nodeId}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className={`px-3.5 py-2.5 ${i > 0 ? "border-t border-line-soft" : ""}`}
                  >
                    <code className="font-mono text-[11px] text-accent/85">
                      {step.record}
                    </code>
                    <div className="mt-1 text-[12px] leading-snug text-ink-soft">{step.detail}</div>
                  </motion.div>
                ))}
                {steps.length === 0 && (
                  <div className="flex items-center gap-2 px-3.5 py-2.5 text-[11.5px] text-ink-faint">
                    <Spinner className="text-accent" />
                    Connecting to the context graph…
                  </div>
                )}
                {status === "running" &&
                  steps.length > 0 &&
                  steps.length < workflow.retrieval.length && (
                    <div className="border-t border-line-soft px-3.5 py-[13px]" aria-hidden>
                      <div className="skeleton h-[11px] w-[130px]" />
                      <div
                        className="skeleton mt-[9px] h-[11px]"
                        style={{ width: `${52 + ((steps.length * 17) % 32)}%` }}
                      />
                    </div>
                  )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      )}

      {/* Synthesizing */}
      <AnimatePresence>
        {status === "synthesizing" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-6 overflow-hidden rounded-xl border border-line bg-card shadow-sm"
          >
            <div className="flex items-center gap-2.5 border-b border-line-soft bg-paper/70 px-4 py-2.5">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              <span className="text-[12.5px] text-ink-soft">
                Synthesizing response from {workflow.retrieval.length} records…
              </span>
            </div>
            <div className="space-y-2.5 px-4 py-4" aria-hidden>
              <div className="skeleton h-[15px] w-3/5" />
              <div className="skeleton h-[10px] w-full" />
              <div className="skeleton h-[10px] w-11/12" />
              <div className="skeleton h-[10px] w-2/3" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Response */}
      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mt-8 border-t border-line pt-6 pb-8"
          >
            <h2 className="font-serif text-[19px] font-semibold leading-snug tracking-tight text-ink">
              {workflow.response.headline}
            </h2>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">
              {workflow.response.narrative}
            </p>

            {/* Facts */}
            <div className="mt-5 overflow-hidden rounded-xl border border-line bg-card shadow-sm">
              {workflow.response.facts.map(([k, v], i) => (
                <div
                  key={k}
                  className={`flex gap-3 px-4 py-2.5 text-[12.5px] ${
                    i > 0 ? "border-t border-line-soft" : ""
                  } ${i % 2 === 1 ? "bg-paper/60" : ""}`}
                >
                  <span className="w-[38%] shrink-0 text-ink-faint">{k}</span>
                  <span className="font-medium text-ink">{v}</span>
                </div>
              ))}
            </div>

            {/* Recommendations */}
            <div className="mt-8">
              <SectionLabel>Recommended next steps</SectionLabel>
              <ol className="mt-3 space-y-2.5">
                {workflow.response.recommendations.map((rec, i) => {
                  const id = `${workflow.id}_${i}`;
                  const open = openWhy === id;
                  return (
                    <li
                      key={id}
                      className="rounded-xl border border-line bg-card px-4 py-3 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[10.5px] font-semibold text-accent">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="text-[13px] font-medium leading-snug text-ink">
                            {rec.action}
                          </span>
                          <button
                            onClick={() => setOpenWhy(open ? null : id)}
                            className="ml-2 text-[11.5px] font-medium text-accent hover:underline"
                          >
                            {open ? "hide" : "why?"}
                          </button>
                          <AnimatePresence>
                            {open && (
                              <motion.ul
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="mt-2 overflow-hidden border-l-2 border-accent/25 pl-3"
                              >
                                {rec.why.map((w) => (
                                  <li
                                    key={w}
                                    className="py-0.5 text-[12px] leading-snug text-ink-soft"
                                  >
                                    {w}
                                  </li>
                                ))}
                              </motion.ul>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Artifacts */}
            <div className="mt-8">
              <div className="flex items-baseline gap-2">
                <SectionLabel>Drafted for review</SectionLabel>
                <span className="font-mono text-[10.5px] text-ink-faint">
                  {workflow.response.artifacts.length}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {workflow.response.artifacts.map((a, i) => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.15 + i * 0.12 }}
                  >
                    <ArtifactCard artifact={a} />
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
