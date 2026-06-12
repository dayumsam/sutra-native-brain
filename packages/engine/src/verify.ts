import { InsightContentSchema, type InsightContent } from "@sutra/contracts";

export type Citable = { id: string; key?: string };

export type CitationCheck =
  | { valid: true; content: InsightContent; repairs: Array<{ from: string; to: string }> }
  | { valid: false; problems: string[] };

// The non-negotiable (spec §5): every fact and every `why` cites ids from the
// provided subgraph/documents. Enforced in code, not by prompt alone.
//
// Models reliably *intend* the right node but sometimes cite its
// human-readable key ("ST-65-S3") or mangle the uuid. When a bad citation
// matches EXACTLY ONE context item — by uuid prefix or by key — we repair it
// deterministically and record the repair. Ambiguous or fabricated citations
// still fail the check; degradation stays the backstop.
export function checkCitations(raw: unknown, citables: Citable[]): CitationCheck {
  const parsed = InsightContentSchema.safeParse(raw);
  if (!parsed.success) {
    return { valid: false, problems: [`schema: ${parsed.error.message.slice(0, 500)}`] };
  }
  const content = parsed.data;
  const validIds = new Set(citables.map((c) => c.id));
  const problems: string[] = [];
  const repairs: Array<{ from: string; to: string }> = [];

  const resolve = (citation: string): string | null => {
    if (validIds.has(citation)) return citation;
    if (citation.length < 4) return null;
    const matches = citables.filter(
      (c) =>
        c.id.startsWith(citation.slice(0, 8)) ||
        c.key === citation ||
        (c.key !== undefined && c.key.length >= citation.length && c.key.includes(citation)),
    );
    return matches.length === 1 ? matches[0]!.id : null;
  };

  const checkFacts = (facts: Array<{ text: string; citations: string[] }>, where: string) => {
    for (const fact of facts) {
      fact.citations = fact.citations.map((citation) => {
        const resolved = resolve(citation);
        if (resolved === null) {
          problems.push(`${where}: citation "${citation}" is not in the provided context`);
          return citation;
        }
        if (resolved !== citation) repairs.push({ from: citation, to: resolved });
        return resolved;
      });
    }
  };

  checkFacts(content.facts, "facts");
  for (const [i, rec] of content.recommendations.entries()) {
    checkFacts(rec.why, `recommendations[${i}].why`);
  }

  return problems.length === 0 ? { valid: true, content, repairs } : { valid: false, problems };
}
