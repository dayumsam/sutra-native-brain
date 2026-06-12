import type { z } from "zod";
import type { ChangeEvent, SignalSeverity } from "@sutra/contracts";

// Zod 4: z.ZodObject with any raw shape. Entity schemas are made strict at
// definition time — unknown properties are mapping bugs, not data.
export type EntitySchema = z.ZodObject<z.ZodRawShape>;

export type EntityTypeDef = {
  name: string;
  schema: EntitySchema;
  /** Property names forming the deterministic resolution key, in order. */
  keys: string[];
  /** Renders the entity "card" — embedded for natural-language lookup. */
  card: (props: Record<string, unknown>) => string;
};

export type EdgeTypeDef = {
  name: string;
  src: string;
  dst: string;
};

export type TraversalStep = {
  edge: string;
  direction: "out" | "in";
  label?: string;
};

export type TraversalDef = {
  name: string;
  steps: TraversalStep[];
  maxNodes: number;
  /** Ranking weight per edge type when the cap forces pruning. */
  weights?: Record<string, number>;
};

/** A raw detection produced by a trigger before it becomes a Signal. */
export type Detection = {
  entity_id: string | null;
  payload: Record<string, unknown>;
};

export type TriggerKind = "event" | "threshold" | "graph-pattern";

export type TriggerDef = {
  key: string;
  kind: TriggerKind;
  severity: SignalSeverity;
  /**
   * event kind: inspect a ChangeEvent, return a detection (or null).
   * `entityRef` is resolved to entities.id by the detector.
   */
  match?: (event: ChangeEvent) => null | {
    entityRef?: { type: string; key: string };
    payload: Record<string, unknown>;
  };
  /**
   * threshold / graph-pattern kinds: SQL over the canonical store returning
   * rows shaped as Detection (entity_id, payload jsonb). $1 = tenant_id.
   */
  sql?: string;
  dedupeKey: (d: Detection) => string;
  rateLimit?: { windowMinutes: number };
  /** Name of the traversal template used to investigate this signal. */
  traversal: string;
  /** Phase 1: insights are routed to the whole tenant. */
  audience: "tenant";
};

export type EntityRef = { type: string; key: string };

/** Canonical writes produced by mapping one ChangeEvent. */
export type MappedRecord =
  | { kind: "entity"; type: string; key: string; properties: Record<string, unknown> }
  | {
      kind: "edge";
      type: string;
      src: EntityRef;
      dst: EntityRef;
      properties?: Record<string, unknown>;
      valid_from?: string;
      valid_to?: string | null;
    }
  | {
      kind: "document";
      source_id: string;
      title: string;
      body: string;
      metadata?: Record<string, unknown>;
      /** Entities this document is ABOUT — linked after upsert. */
      mentions?: EntityRef[];
    };

export type SourceMapping = {
  map: (event: ChangeEvent) => MappedRecord[];
};

export type OntologyDef = {
  entities: EntityTypeDef[];
  edges: EdgeTypeDef[];
  triggers: TriggerDef[];
  traversals: TraversalDef[];
  /** Per-source field mappings, keyed by ChangeEvent.source. */
  sources: Record<string, SourceMapping>;
};
