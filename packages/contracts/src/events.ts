import { z } from "zod";

// The uniform change-event envelope every connector emits (ARCHITECTURE.md §1).
export const ChangeEventSchema = z.object({
  source: z.string().min(1),
  source_id: z.string().min(1),
  tenant_id: z.string().min(1),
  op: z.enum(["upsert", "delete"]),
  payload: z.record(z.string(), z.unknown()),
  acl: z.record(z.string(), z.unknown()).default({}),
  observed_at: z.iso.datetime(),
});

export type ChangeEvent = z.infer<typeof ChangeEventSchema>;

// A ChangeEvent as persisted in the append-only event log.
export type StoredEvent = ChangeEvent & {
  id: string; // bigserial, kept as string to avoid bigint JSON pitfalls
  processed_at: string | null;
};
