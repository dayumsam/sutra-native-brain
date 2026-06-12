import { registerOTel, OTLPHttpProtoTraceExporter } from "@vercel/otel";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import type { Logger } from "@opentelemetry/api-logs";

const SERVICE_NAME = "native-operating-brain";

export function register() {
  // Traces → Langfuse (spine debugging). No-op without keys, so production —
  // which never gets these env vars — is completely unaffected.
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (publicKey && secretKey) {
    const baseUrl = process.env.LANGFUSE_BASE_URL ?? "https://us.cloud.langfuse.com";
    console.log(`[otel] trace export → Langfuse (${baseUrl}) enabled`);
    registerOTel({
      serviceName: SERVICE_NAME,
      traceExporter: new OTLPHttpProtoTraceExporter({
        url: `${baseUrl}/api/public/otel/v1/traces`,
        headers: {
          Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`,
        },
      }),
    });
  }

  // Logs → PostHog (pre-existing pipeline, unchanged).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const exporter = new OTLPLogExporter({
      url: "https://us.i.posthog.com/i/v1/logs",
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const loggerProvider = new LoggerProvider({
      resource: resourceFromAttributes({
        "service.name": SERVICE_NAME,
      }),
      processors: [new SimpleLogRecordProcessor(exporter)],
    });

    (globalThis as { __posthogLogger?: Logger }).__posthogLogger =
      loggerProvider.getLogger(SERVICE_NAME);
  }
}
