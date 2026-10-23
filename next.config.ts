import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Geolocation is needed by the driver trip screen; everything else is off.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  // Every application page is per-user and authorization-sensitive, so the app
  // uses request-time rendering instead of Cache Components. See README
  // "Architecture decisions".
  cacheComponents: false,
  partialPrefetching: false,
  // PGlite ships a WASM build of Postgres and the `postgres` driver uses Node
  // sockets; both must stay out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    // There is an unrelated package-lock.json higher up the directory tree.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
