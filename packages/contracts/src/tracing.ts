import { SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";

const tracer = () => trace.getTracer("sutra-spine");

// Every pipeline stage wraps itself in a span (spec §9). Attributes set here
// land in Langfuse; errors are recorded and re-thrown.
// `root: true` starts a new trace instead of nesting under the active one —
// used for agent runs so each is its own trace, grouped into a Langfuse
// session via the `langfuse.session.id` attribute.
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (setAttributes: (attrs: Attributes) => void) => Promise<T>,
  options?: { root?: boolean },
): Promise<T> {
  return tracer().startActiveSpan(
    name,
    { attributes, root: options?.root ?? false },
    async (span) => {
      try {
        const result = await fn((attrs) => span.setAttributes(attrs));
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
