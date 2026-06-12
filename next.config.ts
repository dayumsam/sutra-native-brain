import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages export TypeScript source directly.
  transpilePackages: [
    "@sutra/contracts",
    "@sutra/ontology-core",
    "@sutra/graph",
    "@sutra/ingestion",
    "@sutra/engine",
    "@sutra/ontology-manufacturing",
    "@sutra/customer-demo",
  ],
  serverExternalPackages: ["pg"],
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
