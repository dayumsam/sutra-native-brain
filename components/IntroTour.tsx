"use client";

import { useEffect, useState, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DOMAIN_META, type Domain } from "@/lib/demo-data";

type TargetRect = { top: number; left: number; width: number; height: number };

type Props = {
  open: boolean;
  asideRef: RefObject<HTMLElement | null>;
  graphRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onRunFirst: () => void;
};

const LEGEND_DOMAINS: Domain[] = ["product", "component", "supplier", "manufacturing", "service", "quality"];

const STEPS: { target?: "graph" | "aside" }[] = [
  {},
  { target: "graph" },
  { target: "aside" },
  {},
];

export function IntroTour({ open, asideRef, graphRef, onClose, onRunFirst }: Props) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);

  const target = STEPS[step]?.target;
  const last = step === STEPS.length - 1;

  // Reset to the first step each time the tour opens (render-time reset, not an effect)
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setStep(0);
  }

  useEffect(() => {
    if (!open) return;
    const el =
      target === "aside" ? asideRef.current : target === "graph" ? graphRef.current : null;
    if (!el) {
      setRect(null);
      return;
    }
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    // On small screens the page scrolls, so the target may be off-screen
    if (window.innerWidth < 1024) {
      el.scrollIntoView({ behavior: "smooth", block: target === "aside" ? "start" : "center" });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, target, asideRef, graphRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && !last) setStep((s) => s + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep((s) => s - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, last, onClose]);

  const spotlight = target && rect;

  // Where the card sits relative to the spotlit region.
  // Desktop anchors it beside/over the target; small screens get a bottom sheet
  // since the anchored positions can land outside the viewport there.
  const cardStyle: React.CSSProperties = {};
  let cardPlacement: "center" | "fixed" | "sheet" = "center";
  if (spotlight && typeof window !== "undefined") {
    const vw = window.innerWidth;
    if (vw < 1024) {
      cardPlacement = "sheet";
    } else {
      cardPlacement = "fixed";
      const cardW = Math.min(400, vw - 32);
      if (target === "aside") {
        // sidebar — card to its right, near the top
        cardStyle.left = rect.left + rect.width + 20;
        cardStyle.top = Math.max(16, rect.top + 20);
      } else {
        // graph — card floats centered over the canvas
        cardStyle.left = rect.left + rect.width / 2;
        cardStyle.top = rect.top + rect.height / 2;
        cardStyle.transform = "translate(-50%, -50%)";
      }
      cardStyle.width = cardW;
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[10000]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          {/* Backdrop — either a spotlight hole or a full dim layer */}
          {spotlight ? (
            <div
              className="absolute transition-all duration-300 ease-out"
              style={{
                top: rect.top - 4,
                left: rect.left - 4,
                width: rect.width + 8,
                height: rect.height + 8,
                borderRadius: target === "graph" ? 20 : 12,
                boxShadow: "0 0 0 9999px rgba(23,20,44,0.52)",
                border: "1.5px solid rgba(110,98,232,0.55)",
              }}
            />
          ) : (
            <div className="absolute inset-0 bg-[rgba(23,20,44,0.52)]" />
          )}

          {/* Card */}
          <div
            className={
              cardPlacement === "center"
                ? "absolute inset-0 flex items-center justify-center p-4"
                : ""
            }
          >
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
              style={
                cardPlacement === "fixed"
                  ? { position: "fixed", maxHeight: "calc(100dvh - 32px)", ...cardStyle }
                  : cardPlacement === "sheet"
                    ? {
                        position: "fixed",
                        left: 12,
                        right: 12,
                        bottom: "calc(12px + env(safe-area-inset-bottom))",
                        maxHeight: "55dvh",
                      }
                    : {
                        width: "min(440px, calc(100vw - 32px))",
                        maxHeight: "calc(100dvh - 32px)",
                      }
              }
            >
              <div className="min-h-0 flex-1 overflow-y-auto">
                <StepContent step={step} />
              </div>

              {/* Footer */}
              <div className="flex shrink-0 items-center justify-between border-t border-line-soft px-5 py-3.5">
                <div className="flex items-center gap-1.5">
                  {STEPS.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === step ? "w-4 bg-accent" : "w-1.5 bg-line"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {step === 0 ? (
                    <button
                      onClick={onClose}
                      className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-ink-faint transition-colors hover:text-ink-soft"
                    >
                      Skip intro
                    </button>
                  ) : (
                    <button
                      onClick={() => setStep((s) => s - 1)}
                      className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-ink-faint transition-colors hover:text-ink-soft"
                    >
                      Back
                    </button>
                  )}
                  {last ? (
                    <>
                      <button
                        onClick={onClose}
                        className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-line-soft"
                      >
                        Explore on my own
                      </button>
                      <button
                        onClick={onRunFirst}
                        className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                      >
                        Run the first workflow
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setStep((s) => s + 1)}
                      className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                    >
                      Next
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StepContent({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div className="px-5 pb-5 pt-5">
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-accent">
          Sutra · Core intelligence layer
        </div>
        <h2 className="mt-1.5 text-[17px] font-semibold tracking-tight text-ink">
          A quick orientation before you start
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          Sutra is the core system underneath the operation. It integrates data from every source
          a business runs on: products, components, suppliers, manufacturing lots, service
          tickets, device telemetry, and warranty claims, all connected in one living graph.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          Everything you&apos;ll see is built on top of that layer: agents that read it, reason
          over it, and hand back finished work. This walkthrough is a pre-computed simulation
          running on synthetic data, built specifically for Native.
        </p>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="px-5 pb-5 pt-5">
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-accent">
          1 · The context graph
        </div>
        <h2 className="mt-1.5 text-[17px] font-semibold tracking-tight text-ink">
          Every dot is a real operational record
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          Each line is a relationship that exists in the business: a service ticket links to a
          device, the device to its manufacturing lot, the lot to its supplier. Color shows which
          part of the operation a record comes from.
        </p>
        <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-line-soft bg-paper px-3.5 py-3">
          {LEGEND_DOMAINS.map((d) => (
            <span key={d} className="flex items-center gap-2 text-[11.5px] text-ink-soft">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: DOMAIN_META[d].color }}
              />
              {DOMAIN_META[d].label}
            </span>
          ))}
          <span className="flex items-center gap-2 text-[11.5px] text-ink-faint">
            <span className="h-2 w-2 shrink-0 rounded-full bg-line" />
            +5 more domains
          </span>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
          Once the tour ends, hover any node to see the record behind it, and drag nodes to
          explore.
        </p>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="px-5 pb-5 pt-5">
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-accent">
          2 · The workflows
        </div>
        <h2 className="mt-1.5 text-[17px] font-semibold tracking-tight text-ink">
          Four runs, each triggered by a real event
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          A new service ticket, a system alert, a supplier email, a proposed component change.
          Click a workflow and watch the agent light up the records it reads, in order, before it
          writes anything.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          They&apos;re designed to be run top to bottom, but you can jump to any of them.
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 pb-5 pt-5">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-accent">
        3 · The response
      </div>
      <h2 className="mt-1.5 text-[17px] font-semibold tracking-tight text-ink">
        What the agent hands back
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
        When a run finishes, the panel on the right shows three things:
      </p>
      <div className="mt-3 space-y-1.5">
        {[
          ["The trigger", "the event exactly as it arrived"],
          ["The retrieval log", "every record the agent read, and why it mattered"],
          ["The drafts", "emails, tasks, checklists, and memos grounded in those records"],
        ].map(([label, desc], i) => (
          <div
            key={label}
            className="flex items-start gap-3 rounded-xl border border-line-soft bg-paper px-3.5 py-2.5"
          >
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[10.5px] font-semibold text-accent">
              {i + 1}
            </span>
            <p className="text-[12.5px] leading-snug text-ink-soft">
              <span className="font-semibold text-ink">{label}</span>: {desc}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
        Nothing is written from scratch. Every claim in a draft traces back to a record in the
        graph.
      </p>
    </div>
  );
}
