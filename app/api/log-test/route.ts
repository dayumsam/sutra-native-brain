import { SeverityNumber } from "@opentelemetry/api-logs";
import { getServerLogger } from "@/lib/server-logger";

export async function GET() {
  getServerLogger()?.emit({
    severityNumber: SeverityNumber.INFO,
    severityText: "INFO",
    body: "API route called",
    attributes: { route: "/api/log-test" },
  });
  return Response.json({ ok: true });
}
