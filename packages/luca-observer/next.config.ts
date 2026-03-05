import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Derive WebSocket CSP values from env so production CSP matches the
// configured SpacetimeDB URI instead of assuming localhost:3000.
const spacetimedbUri =
  process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "ws://localhost:3000";
// Ensure both ws and wss variants are allowed
const wsUri = spacetimedbUri.startsWith("wss://")
  ? spacetimedbUri
  : spacetimedbUri.replace(/^https?:\/\//, "ws://");
const wssUri = wsUri.replace(/^ws:\/\//, "wss://");

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: isDev
              ? // Dev: allow eval and inline scripts for Next.js HMR/Fast Refresh
                [
                  "default-src 'self'",
                  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
                  "style-src 'self' 'unsafe-inline'",
                  `connect-src 'self' ${wsUri} ${wssUri}`,
                  "img-src 'self' data:",
                  "font-src 'self'",
                  "frame-ancestors 'none'",
                ].join("; ")
              : // Production: strict CSP — no eval or inline scripts
                [
                  "default-src 'self'",
                  "script-src 'self'",
                  // ACCEPTED EXCEPTION: 'unsafe-inline' is required for Tailwind CSS / Next.js
                  // style injection. Next.js does not support nonce-based style-src.
                  // See: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
                  "style-src 'self' 'unsafe-inline'",
                  `connect-src 'self' ${wsUri} ${wssUri}`,
                  "img-src 'self' data:",
                  "font-src 'self'",
                  "frame-ancestors 'none'",
                ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
