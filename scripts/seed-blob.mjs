// Render the full synthetic timeline as realistic raw source artifacts and
// upload them to Vercel Blob.
// Usage: node --experimental-strip-types scripts/seed-blob.mjs
// Requires BLOB_READ_WRITE_TOKEN in .env.local.
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0 && !line.startsWith("#")) {
    const key = line.slice(0, idx).trim();
    process.env[key] ??= line.slice(idx + 1).trim().replace(/^"|"$/g, "");
  }
}

const { allEvents } = await import("../packages/ingestion/src/synthetic/timeline.ts");
const { renderRawArtifact } = await import("../packages/ingestion/src/raw/shapes.ts");
const { put } = await import("@vercel/blob");

const events = allEvents();
const artifacts = events.map(renderRawArtifact);
console.log(`rendering ${artifacts.length} raw artifacts from ${events.length} events`);

let done = 0;
const CONCURRENCY = 12;
for (let i = 0; i < artifacts.length; i += CONCURRENCY) {
  await Promise.all(
    artifacts.slice(i, i + CONCURRENCY).map((artifact) =>
      put(artifact.key, artifact.body, {
        access: "private",
        contentType: artifact.contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
      }),
    ),
  );
  done = Math.min(i + CONCURRENCY, artifacts.length);
  if (done % 120 < CONCURRENCY) console.log(`uploaded ${done}/${artifacts.length}`);
}
console.log(`uploaded ${artifacts.length} artifacts to Vercel Blob under raw/demo/`);
