import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // In local dev the Python Graphify function runs via `npm run dev:api` (port 8000).
  // On Vercel, api/graph.py is deployed as a Python Function and served at /api/graph.
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [{ source: "/api/graph", destination: "http://127.0.0.1:8000/api/graph" }]
      : [];
  },
};

export default nextConfig;
