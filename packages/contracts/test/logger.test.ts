import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { context, ROOT_CONTEXT, trace, TraceFlags, type Context, type ContextManager } from "@opentelemetry/api";
import { getLogger } from "../src/logger";

const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const SPAN_ID = "b7ad6b7169203331";

// The bare OTel API ships a no-op context manager, so context.with() would not
// propagate. In production @vercel/otel registers a real one; tests need this
// minimal synchronous stand-in.
class SyncContextManager implements ContextManager {
  private current: Context | undefined;
  active(): Context {
    return this.current ?? ROOT_CONTEXT;
  }
  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    ctx: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    const prev = this.current;
    this.current = ctx;
    try {
      return fn.call(thisArg, ...args);
    } finally {
      this.current = prev;
    }
  }
  bind<T>(_ctx: Context, target: T): T {
    return target;
  }
  enable(): this {
    return this;
  }
  disable(): this {
    return this;
  }
}

context.setGlobalContextManager(new SyncContextManager().enable());
afterAll(() => context.disable());

describe("getLogger", () => {
  let lines: string[];

  beforeEach(() => {
    lines = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(line);
    });
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits structured JSON with scope, level, message, and data", () => {
    getLogger("graph").info({ rows: 3 }, "upserted entities");
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({
      scope: "graph",
      level: "info",
      msg: "upserted entities",
      rows: 3,
    });
    expect(entry.time).toBeTypeOf("string");
  });

  it("injects the active OTel trace and span ids", () => {
    const spanContext = {
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      traceFlags: TraceFlags.SAMPLED,
    };
    const ctx = trace.setSpan(
      context.active(),
      trace.wrapSpanContext(spanContext),
    );
    context.with(ctx, () => {
      getLogger("engine").warn({}, "detector slow");
    });
    const entry = JSON.parse(lines[0]!);
    expect(entry.trace_id).toBe(TRACE_ID);
    expect(entry.span_id).toBe(SPAN_ID);
  });

  it("omits trace ids when no span is active", () => {
    getLogger("engine").info({}, "no trace");
    const entry = JSON.parse(lines[0]!);
    expect(entry.trace_id).toBeUndefined();
  });

  it("filters below LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "warn";
    const log = getLogger("ingest");
    log.debug({}, "hidden");
    log.info({}, "hidden too");
    log.warn({}, "visible");
    log.error({}, "also visible");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).level).toBe("warn");
  });

  it("defaults to debug level outside production", () => {
    getLogger("ingest").debug({ q: 1 }, "verbose by default in dev");
    expect(lines).toHaveLength(1);
  });
});
