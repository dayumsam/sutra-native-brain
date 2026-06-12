import { embedMany } from "ai";

export const EMBEDDING_DIM = 1536;

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

// Production embedder via AI Gateway ("provider/model" string).
export class GatewayEmbedder implements Embedder {
  constructor(private readonly model = "openai/text-embedding-3-small") {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { embeddings } = await embedMany({ model: this.model, values: texts });
    return embeddings;
  }
}

// Deterministic test embedder: token-hash bag-of-words, L2-normalized.
// Similar texts share tokens, so cosine similarity behaves directionally
// like a real model without any network call.
export class FakeEmbedder implements Embedder {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vec = new Array<number>(EMBEDDING_DIM).fill(0);
      for (const token of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
        let h = 2166136261;
        for (let i = 0; i < token.length; i++) {
          h = Math.imul(h ^ token.charCodeAt(i), 16777619);
        }
        const idx = Math.abs(h) % EMBEDDING_DIM;
        vec[idx] = (vec[idx] ?? 0) + 1;
      }
      const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
      return vec.map((x) => x / norm);
    });
  }
}

export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
