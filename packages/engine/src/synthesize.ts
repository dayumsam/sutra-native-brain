import { generateObject } from "ai";
import { z } from "zod";
import { InsightContentSchema } from "@sutra/contracts";

// Ports for the two model calls, so tests inject deterministic fakes and the
// production wiring picks gateway "provider/model" strings (spec §6: cheap
// model for verification, strong model for synthesis).

export type SynthesisResult = {
  /** Raw object from the model — validated by the caller against the schema. */
  content: unknown;
  tokensIn: number;
  tokensOut: number;
};

export interface Synthesizer {
  synthesize(args: { system: string; prompt: string }): Promise<SynthesisResult>;
}

export type VerifierResult = { ok: boolean; notes: string; tokensIn: number; tokensOut: number };

export interface Verifier {
  verify(args: { prompt: string }): Promise<VerifierResult>;
}

export const SYNTHESIS_SYSTEM_PROMPT = [
  "You are the analysis engine of an operational context-graph system for manufacturing ops.",
  "Produce an insight strictly matching the output schema.",
  "CITATION RULES (hard requirements):",
  "- Every fact and every recommendation reason carries citations.",
  "- A citation is the bare id that appears in square brackets in the context (without the brackets).",
  "- Cite ONLY ids present in the provided context. Never invent ids.",
  "- Copy each id EXACTLY as it appears between the brackets (the full 36-character value).",
  "- Never cite ticket numbers, lot codes, serial numbers, or any human-readable code — only bracketed ids.",
  "- Numbers you state must come from the cited entities or documents.",
  "Recommended actions must be concrete next steps an ops team can execute.",
  "",
  "ARTIFACT RULES — produce 2 to 4 ready-to-use drafts that operationalize the top recommendations,",
  "each matched to its audience. Vary the kinds; do not make everything a memo:",
  "- email_draft: an outbound message ready to send (to a supplier, customer, or internal team).",
  "  meta = the recipient line, e.g. \"To: dispatch@aquamotion.in\". lines = the email sentences.",
  "- checklist: a step-by-step working list for a specific person. Name the audience in the title,",
  "  e.g. \"Technician visit checklist: …\" for field service or \"QA review checklist: …\" for the",
  "  quality team. lines = individual actionable steps, imperative voice.",
  "- task: one discrete operational action (reserve stock, hold a PO, schedule an inspection).",
  "  meta = the owning team/system, lines = the specific instructions.",
  "- memo: a short internal briefing for leadership or a cross-functional group. Use at most one.",
  "All artifacts are drafts requiring human approval before anything is sent or executed.",
].join("\n");

export class GatewaySynthesizer implements Synthesizer {
  constructor(private readonly model = process.env.SYNTHESIS_MODEL ?? "anthropic/claude-sonnet-4-6") {}

  async synthesize(args: { system: string; prompt: string }): Promise<SynthesisResult> {
    const result = await generateObject({
      model: this.model,
      schema: InsightContentSchema,
      system: args.system,
      prompt: args.prompt,
      experimental_telemetry: { isEnabled: true },
    });
    return {
      content: result.object,
      tokensIn: result.usage.inputTokens ?? 0,
      tokensOut: result.usage.outputTokens ?? 0,
    };
  }
}

const VerifierSchema = z.object({
  ok: z.boolean(),
  notes: z.string(),
});

export class GatewayVerifier implements Verifier {
  constructor(private readonly model = process.env.VERIFIER_MODEL ?? "anthropic/claude-haiku-4-5") {}

  async verify(args: { prompt: string }): Promise<VerifierResult> {
    const result = await generateObject({
      model: this.model,
      schema: VerifierSchema,
      system:
        "You check a generated operational insight against its source context. " +
        "Flag any number, claim, or recommendation not supported by the cited entities/documents. " +
        "Respond ok=true only when everything checks out.",
      prompt: args.prompt,
      experimental_telemetry: { isEnabled: true },
    });
    return {
      ok: result.object.ok,
      notes: result.object.notes,
      tokensIn: result.usage.inputTokens ?? 0,
      tokensOut: result.usage.outputTokens ?? 0,
    };
  }
}
