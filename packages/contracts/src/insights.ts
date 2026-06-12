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

export const ArtifactSchema = z.object({
  kind: z.string().min(1), // e.g. "email_draft", "checklist", "capa_form"
  title: z.string().min(1),
  body: z.string().min(1),
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
