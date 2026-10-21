import type { NextConfig } from "next";

// Browser hardening headers (docs/SECURITY-AUDIT.md, H3). Deliberately zero-risk for the
// capstone: no script-src / style-src yet — a full Content-Security-Policy (nonces or SRI,
// compatible with prerendering) is a follow-up. microphone=(self): our own pages may ask for the
// mic (phase 8 speech input — the browser still asks the user); other origins never can.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
};

export default nextConfig;
