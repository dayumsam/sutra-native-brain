import type { z } from "zod";

import type {
  EdgeTypeDef,
  EntitySchema,
  EntityTypeDef,
  TraversalDef,
  TraversalStep,
  TriggerDef,
} from "./types";

export function defineEntityType<S extends EntitySchema>(
  name: string,
  def: {
    schema: S;
    keys: Array<Extract<keyof z.infer<S>, string>>;
    card: (props: z.infer<S>) => string;
  },
): EntityTypeDef {
  const shape = def.schema.shape;
  for (const key of def.keys) {
    if (!(key in shape)) {
      throw new Error(`Entity type "${name}": resolution key "${key}" is not in the schema`);
    }
  }
  if (def.keys.length === 0) {
    throw new Error(`Entity type "${name}" must declare at least one resolution key`);
  }
  return {
    name,
    // Unknown properties are mapping bugs — reject, don't strip.
    schema: def.schema.strict(),
    keys: def.keys,
    card: def.card as EntityTypeDef["card"],
  };
}

export function defineEdgeType(
  name: string,
  def: { src: EntityTypeDef | string; dst: EntityTypeDef | string },
): EdgeTypeDef {
  return {
    name,
    src: typeof def.src === "string" ? def.src : def.src.name,
    dst: typeof def.dst === "string" ? def.dst : def.dst.name,
  };
}

export function defineTraversal(
  name: string,
  def: { steps: TraversalStep[]; maxNodes: number; weights?: Record<string, number> },
): TraversalDef {
  if (def.steps.length === 0) {
    throw new Error(`Traversal "${name}" must have at least one step`);
  }
  if (def.maxNodes <= 0) {
    throw new Error(`Traversal "${name}": maxNodes must be positive`);
  }
  return { name, ...def };
}

export function defineTrigger(key: string, def: Omit<TriggerDef, "key">): TriggerDef {
  if (def.kind === "event" && !def.match) {
    throw new Error(`Trigger "${key}" is kind "event" but has no match()`);
  }
  if (def.kind !== "event" && !def.sql) {
    throw new Error(`Trigger "${key}" is kind "${def.kind}" but has no sql`);
  }
  return { key, ...def };
}
