import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import type { Logger } from "@opentelemetry/api-logs";

export function register() {
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
        "service.name": "native-operating-brain",
      }),
      processors: [new SimpleLogRecordProcessor(exporter)],
    });

    (globalThis as { __posthogLogger?: Logger }).__posthogLogger =
      loggerProvider.getLogger("native-operating-brain");
  }
}
