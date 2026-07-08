import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";

const cspHeader = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  [
    "script-src 'self' 'unsafe-inline'",
    isDevelopment ? "'unsafe-eval'" : "",
    "https://www.googletagmanager.com",
    "https://static.cloudflareinsights.com",
    "https://umami.dimthink.com",
    "https://challenges.cloudflare.com",
  ].filter(Boolean).join(" "),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  [
    "connect-src 'self'",
    "https:",
    isDevelopment ? "http://localhost:* http://127.0.0.1:* ws: wss:" : "",
  ].filter(Boolean).join(" "),
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  isDevelopment ? "" : "upgrade-insecure-requests",
].filter(Boolean).join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspHeader,
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  ...(process.env.NEXT_DEPLOYMENT_ID ? { deploymentId: process.env.NEXT_DEPLOYMENT_ID } : {}),
  devIndicators: false,
  // Keep ISR stale windows short so cached HTML/RSC cannot outlive its asset bundle for weeks.
  expireTime: 3600,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/icon.svg",
        headers: [
          {
            key: "Cache-Control",
            value: "public,max-age=31536000,immutable",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/$",
        destination: "/",
        permanent: true,
      },
      {
        source: "/&",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
