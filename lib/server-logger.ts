import type { Logger } from "@opentelemetry/api-logs";

// Set in instrumentation.ts at server startup; undefined in non-Node runtimes.
export function getServerLogger(): Logger | undefined {
  return (globalThis as { __posthogLogger?: Logger }).__posthogLogger;
}
