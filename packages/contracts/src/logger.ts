import { trace } from "@opentelemetry/api";
import { SeverityNumber, type Logger as OtelLogger } from "@opentelemetry/api-logs";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const OTEL_SEVERITY: Record<LogLevel, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

export type Logger = {
  [L in LogLevel]: (data: Record<string, unknown>, msg: string) => void;
};

function minLevel(): number {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  if (configured && configured in LEVEL_RANK) return LEVEL_RANK[configured];
  // Verbose by default everywhere except production (spec §9).
  return process.env.NODE_ENV === "production" ? LEVEL_RANK.info : LEVEL_RANK.debug;
}

// instrumentation.ts stores an OTel logger here so server logs also flow to
// PostHog; absent (tests, client) we just write JSON to the console.
function posthogLogger(): OtelLogger | undefined {
  return (globalThis as { __posthogLogger?: OtelLogger }).__posthogLogger;
}

function emit(scope: string, level: LogLevel, data: Record<string, unknown>, msg: string): void {
  if (LEVEL_RANK[level] < minLevel()) return;

  const span = trace.getActiveSpan();
  const spanContext = span?.spanContext();
  const entry: Record<string, unknown> = {
    time: new Date().toISOString(),
    level,
    scope,
    msg,
    ...data,
  };
  if (spanContext) {
    entry.trace_id = spanContext.traceId;
    entry.span_id = spanContext.spanId;
  }
  console.log(JSON.stringify(entry));

  posthogLogger()?.emit({
    severityNumber: OTEL_SEVERITY[level],
    severityText: level.toUpperCase(),
    body: msg,
    attributes: { scope, ...flatten(data), ...(spanContext ? { trace_id: spanContext.traceId } : {}) },
  });
}

function flatten(data: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue;
    out[key] =
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? value
        : JSON.stringify(value);
  }
  return out;
}

export function getLogger(scope: string): Logger {
  return {
    debug: (data, msg) => emit(scope, "debug", data, msg),
    info: (data, msg) => emit(scope, "info", data, msg),
    warn: (data, msg) => emit(scope, "warn", data, msg),
    error: (data, msg) => emit(scope, "error", data, msg),
  };
}
