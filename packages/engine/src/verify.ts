import { InsightContentSchema, type InsightContent } from "@sutra/contracts";

export type CitationCheck =
  | { valid: true; content: InsightContent }
  | { valid: false; problems: string[] };

// The non-negotiable (spec §5): every fact and every `why` cites ids from the
// provided subgraph/documents. Enforced in code, not by prompt alone.
export function checkCitations(raw: unknown, citableIds: Set<string>): CitationCheck {
  const parsed = InsightContentSchema.safeParse(raw);
  if (!parsed.success) {
    return { valid: false, problems: [`schema: ${parsed.error.message.slice(0, 500)}`] };
  }
  const content = parsed.data;
  const problems: string[] = [];

  const checkFacts = (facts: Array<{ text: string; citations: string[] }>, where: string) => {
    for (const fact of facts) {
      for (const citation of fact.citations) {
        if (!citableIds.has(citation)) {
          problems.push(`${where}: citation "${citation}" is not in the provided context`);
        }
      }
    }
  };

  checkFacts(content.facts, "facts");
  for (const [i, rec] of content.recommendations.entries()) {
    checkFacts(rec.why, `recommendations[${i}].why`);
  }

  return problems.length === 0 ? { valid: true, content } : { valid: false, problems };
}
