export type SignalSeverity = "info" | "warn" | "critical";

// Cheap structured output of the detect stage; input to investigation.
export type Signal = {
  id: string;
  tenant_id: string;
  trigger_key: string;
  /** Primary entity the signal is about (entities.id). */
  entity_id: string | null;
  severity: SignalSeverity;
  payload: Record<string, unknown>;
  dedupe_key: string;
  created_at: string;
};

export type AgentRunStatus = "pending" | "running" | "completed" | "degraded" | "failed";
