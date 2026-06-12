import { z } from "zod";

// Every fact must cite node/document IDs from the subgraph supplied to the
// model. Enforced in code by the engine's verifier — not just by prompt.
export const FactSchema = z.object({
  text: z.string().min(1),
  citations: z.array(z.string().min(1)).min(1),
});

export const RecommendationSchema = z.object({
  action: z.string().min(1),
  why: z.array(FactSchema).min(1),
});

// Draft work products attached to an insight, always pending human approval.
// kind is a closed enum so the UI renders each artifact correctly:
//   email_draft — outbound message; meta carries the recipient ("To: …")
//   checklist   — step-by-step list for a person (technician, QA, employee);
//                 the title names who it is for
//   task        — a discrete operational action (reserve stock, hold a PO)
//   memo        — internal briefing note
export const ArtifactSchema = z.object({
  kind: z.enum(["email_draft", "checklist", "task", "memo"]),
  title: z.string().min(1),
  /** Short context line, e.g. "To: dispatch@aquamotion.in" or "Quality team". */
  meta: z.string().optional(),
  /** One entry per line/step/sentence — rendered as structured rows, not prose. */
  lines: z.array(z.string().min(1)).min(1),
});

// The demo's insight shape, kept as the production schema (ARCHITECTURE.md §5).
export const InsightContentSchema = z.object({
  headline: z.string().min(1),
  narrative: z.string().min(1),
  facts: z.array(FactSchema).min(1),
  recommendations: z.array(RecommendationSchema),
  artifacts: z.array(ArtifactSchema).default([]),
});

export type Fact = z.infer<typeof FactSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type InsightContent = z.infer<typeof InsightContentSchema>;

export type InsightStatus = "new" | "delivered" | "superseded" | "withheld";
