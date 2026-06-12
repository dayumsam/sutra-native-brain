import { list, put } from "@vercel/blob";
import type { RawArtifact } from "./shapes";

// Object-store abstraction for raw payloads (ARCHITECTURE.md §1: keep raw
// payloads in object storage so normalization can be re-run without
// re-crawling). Vercel Blob in phase 1; the surface is the S3 subset a real
// bucket would need (list-by-prefix + get + put).
export interface RawStore {
  putArtifact(artifact: RawArtifact): Promise<void>;
  listKeys(prefix: string): Promise<string[]>;
  getBody(key: string): Promise<string>;
}

export class InMemoryRawStore implements RawStore {
  private readonly objects = new Map<string, string>();

  async putArtifact(artifact: RawArtifact): Promise<void> {
    this.objects.set(artifact.key, artifact.body);
  }
  async listKeys(prefix: string): Promise<string[]> {
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
  async getBody(key: string): Promise<string> {
    const body = this.objects.get(key);
    if (body === undefined) throw new Error(`No object at ${key}`);
    return body;
  }
}

export class BlobRawStore implements RawStore {
  private readonly urls = new Map<string, string>();

  constructor(private readonly token = process.env.BLOB_READ_WRITE_TOKEN) {
    if (!this.token) throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  }

  async putArtifact(artifact: RawArtifact): Promise<void> {
    await put(artifact.key, artifact.body, {
      access: "private",
      contentType: artifact.contentType,
      token: this.token,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  }

  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000, token: this.token });
      for (const blob of page.blobs) {
        keys.push(blob.pathname);
        this.urls.set(blob.pathname, blob.downloadUrl ?? blob.url);
      }
      cursor = page.cursor ?? undefined;
    } while (cursor);
    return keys.sort();
  }

  async getBody(key: string): Promise<string> {
    const url = this.urls.get(key);
    if (!url) throw new Error(`Unknown blob key ${key} — call listKeys first`);
    // Private store: blob fetches authenticate with the RW token.
    const res = await fetch(url, { headers: { authorization: `Bearer ${this.token}` } });
    if (!res.ok) throw new Error(`Blob fetch ${key} failed: HTTP ${res.status}`);
    return res.text();
  }
}
