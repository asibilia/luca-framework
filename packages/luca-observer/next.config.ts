import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

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
                  "connect-src 'self' ws://localhost:3000 wss://localhost:3000",
                  "img-src 'self' data:",
                  "font-src 'self'",
                  "frame-ancestors 'none'",
                ].join("; ")
              : // Production: strict CSP — no eval or inline scripts
                [
                  "default-src 'self'",
                  "script-src 'self'",
                  "style-src 'self' 'unsafe-inline'",
                  "connect-src 'self' ws://localhost:3000 wss://localhost:3000",
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
