import type { z } from "zod";
import { Ontology } from "./ontology";
import type {
  EdgeTypeDef,
  EntitySchema,
  EntityTypeDef,
  SourceMapping,
  TraversalDef,
  TriggerDef,
} from "./types";

export type OntologyPatch = {
  extend?: {
    entities?: EntityTypeDef[];
    /** Add fields to existing entity schemas: { Batch: { zone: z.string() } } */
    entityFields?: Record<string, z.ZodRawShape>;
    edges?: EdgeTypeDef[];
    triggers?: TriggerDef[];
    traversals?: TraversalDef[];
    sources?: Record<string, SourceMapping>;
  };
  override?: {
    entities?: EntityTypeDef[];
    edges?: EdgeTypeDef[];
    triggers?: TriggerDef[];
    traversals?: TraversalDef[];
    sources?: Record<string, SourceMapping>;
  };
};

function upsertByName<T>(
  list: T[],
  additions: T[] | undefined,
  replacements: T[] | undefined,
  nameOf: (item: T) => string,
  what: string,
): T[] {
  const out = new Map(list.map((item) => [nameOf(item), item]));
  for (const item of additions ?? []) {
    if (out.has(nameOf(item))) {
      throw new Error(
        `extend ${what} "${nameOf(item)}" already exists in the base ontology — use override`,
      );
    }
    out.set(nameOf(item), item);
  }
  for (const item of replacements ?? []) {
    if (!out.has(nameOf(item))) {
      throw new Error(
        `override ${what} "${nameOf(item)}" does not exist in the base ontology — use extend`,
      );
    }
    out.set(nameOf(item), item);
  }
  return [...out.values()];
}

// Builds a customer ontology from a base. Never mutates the base — bad
// composition should fail construction, not poison a shared vertical package.
export function composeOntology(base: Ontology, patch: OntologyPatch): Ontology {
  const def = base.toDef();

  let entities = upsertByName(
    def.entities,
    patch.extend?.entities,
    patch.override?.entities,
    (e) => e.name,
    "entity",
  );

  for (const [typeName, fields] of Object.entries(patch.extend?.entityFields ?? {})) {
    const existing = entities.find((e) => e.name === typeName);
    if (!existing) {
      throw new Error(`extend entityFields: unknown entity type "${typeName}"`);
    }
    entities = entities.map((e) =>
      e.name === typeName
        ? { ...e, schema: (e.schema.extend(fields) as EntitySchema).strict() }
        : e,
    );
  }

  return new Ontology({
    entities,
    edges: upsertByName(def.edges, patch.extend?.edges, patch.override?.edges, (e) => e.name, "edge"),
    triggers: upsertByName(
      def.triggers,
      patch.extend?.triggers,
      patch.override?.triggers,
      (t) => t.key,
      "trigger",
    ),
    traversals: upsertByName(
      def.traversals,
      patch.extend?.traversals,
      patch.override?.traversals,
      (t) => t.name,
      "traversal",
    ),
    sources: { ...def.sources, ...patch.extend?.sources, ...patch.override?.sources },
  });
}
