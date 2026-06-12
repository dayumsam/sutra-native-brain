import { defineOntology } from "@sutra/ontology-core";
import { ENTITIES } from "./entities";
import { EDGES } from "./edges";
import { TRIGGERS } from "./triggers";
import { TRAVERSALS } from "./traversals";
import { SOURCES } from "./sources";

export * from "./entities";
export * from "./edges";
export * from "./triggers";
export * from "./traversals";
export { SOURCES } from "./sources";

/** The manufacturing-ops vertical base. Customers compose on top of this. */
export const manufacturing = defineOntology({
  entities: ENTITIES,
  edges: EDGES,
  triggers: TRIGGERS,
  traversals: TRAVERSALS,
  sources: SOURCES,
});
