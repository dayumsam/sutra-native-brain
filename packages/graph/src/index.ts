export { createDb, type Db } from "./db";
export { migrate } from "./migrate";
export {
  EMBEDDING_DIM,
  FakeEmbedder,
  GatewayEmbedder,
  NullEmbedder,
  toVectorLiteral,
  type Embedder,
} from "./embed";
export { GraphStore, type EntityRow } from "./store";
export { PgEventBus } from "./bus";
export { extractSubgraph, type Subgraph, type SubgraphEdge, type SubgraphNode } from "./traverse";
export { docsMentioning, hybridSearch, type ChunkHit, type EntityHit, type SearchResults } from "./search";
