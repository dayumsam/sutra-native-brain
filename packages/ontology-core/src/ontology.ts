import { z } from "zod";
import type {
  EdgeTypeDef,
  EntityTypeDef,
  OntologyDef,
  SourceMapping,
  TraversalDef,
  TriggerDef,
} from "./types";

export class OntologyValidationError extends Error {
  constructor(
    message: string,
    public readonly issues?: z.ZodError,
  ) {
    super(message);
    this.name = "OntologyValidationError";
  }
}

// An Ontology is a value passed into every subsystem — nothing imports a
// global one. Construction validates referential integrity so a broken
// ontology fails at startup, never at write time.
export class Ontology {
  private readonly entities: Map<string, EntityTypeDef>;
  private readonly edges: Map<string, EdgeTypeDef>;
  private readonly triggers: Map<string, TriggerDef>;
  private readonly traversals: Map<string, TraversalDef>;
  readonly sources: Record<string, SourceMapping>;

  constructor(def: OntologyDef) {
    this.entities = new Map(def.entities.map((e) => [e.name, e]));
    this.edges = new Map(def.edges.map((e) => [e.name, e]));
    this.triggers = new Map(def.triggers.map((t) => [t.key, t]));
    this.traversals = new Map(def.traversals.map((t) => [t.name, t]));
    this.sources = def.sources;

    for (const edge of this.edges.values()) {
      for (const endpoint of [edge.src, edge.dst]) {
        if (!this.entities.has(endpoint)) {
          throw new Error(
            `Edge type "${edge.name}" references unknown entity type "${endpoint}"`,
          );
        }
      }
    }
    for (const traversal of this.traversals.values()) {
      for (const step of traversal.steps) {
        if (!this.edges.has(step.edge)) {
          throw new Error(
            `Traversal "${traversal.name}" references unknown edge type "${step.edge}"`,
          );
        }
      }
    }
    for (const trigger of this.triggers.values()) {
      if (!this.traversals.has(trigger.traversal)) {
        throw new Error(
          `Trigger "${trigger.key}" references unknown traversal "${trigger.traversal}"`,
        );
      }
    }
  }

  toDef(): OntologyDef {
    return {
      entities: [...this.entities.values()],
      edges: [...this.edges.values()],
      triggers: [...this.triggers.values()],
      traversals: [...this.traversals.values()],
      sources: { ...this.sources },
    };
  }

  entityTypes(): EntityTypeDef[] {
    return [...this.entities.values()];
  }
  edgeTypes(): EdgeTypeDef[] {
    return [...this.edges.values()];
  }
  triggerDefs(): TriggerDef[] {
    return [...this.triggers.values()];
  }

  entity(name: string): EntityTypeDef {
    const def = this.entities.get(name);
    if (!def) throw new OntologyValidationError(`Unknown entity type "${name}"`);
    return def;
  }

  edge(name: string): EdgeTypeDef {
    const def = this.edges.get(name);
    if (!def) throw new OntologyValidationError(`Unknown edge type "${name}"`);
    return def;
  }

  trigger(key: string): TriggerDef {
    const def = this.triggers.get(key);
    if (!def) throw new OntologyValidationError(`Unknown trigger "${key}"`);
    return def;
  }

  traversal(name: string): TraversalDef {
    const def = this.traversals.get(name);
    if (!def) throw new OntologyValidationError(`Unknown traversal "${name}"`);
    return def;
  }

  /** Write-boundary gate: parse (and default) properties or throw. */
  validateEntity(type: string, properties: Record<string, unknown>): Record<string, unknown> {
    const def = this.entity(type);
    const result = def.schema.safeParse(properties);
    if (!result.success) {
      throw new OntologyValidationError(
        `Invalid properties for entity type "${type}": ${result.error.message}`,
        result.error,
      );
    }
    return result.data;
  }

  /** Write-boundary gate: endpoint entity types must match the edge definition. */
  validateEdge(type: string, srcType: string, dstType: string): void {
    const def = this.edge(type);
    if (def.src !== srcType || def.dst !== dstType) {
      throw new OntologyValidationError(
        `Edge "${type}" requires ${def.src}→${def.dst}, got ${srcType}→${dstType}`,
      );
    }
  }

  renderCard(type: string, properties: Record<string, unknown>): string {
    return this.entity(type).card(properties);
  }

  /** Deterministic resolution key for an entity instance. */
  resolutionKey(type: string, properties: Record<string, unknown>): string {
    const def = this.entity(type);
    return def.keys.map((k) => String(properties[k] ?? "")).join("|");
  }
}

export function defineOntology(def: OntologyDef): Ontology {
  return new Ontology(def);
}
