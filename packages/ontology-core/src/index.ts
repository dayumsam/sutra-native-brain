export {
  defineEntityType,
  defineEdgeType,
  defineTraversal,
  defineTrigger,
} from "./define";
export { Ontology, OntologyValidationError, defineOntology } from "./ontology";
export { composeOntology, type OntologyPatch } from "./compose";
export { OntologyRegistry } from "./registry";
export type {
  Detection,
  EdgeTypeDef,
  EntityRef,
  EntitySchema,
  EntityTypeDef,
  MappedRecord,
  OntologyDef,
  SourceMapping,
  TraversalDef,
  TraversalStep,
  TriggerDef,
  TriggerKind,
} from "./types";
