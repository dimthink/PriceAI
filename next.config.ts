import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NEXT_DEPLOYMENT_ID ? { deploymentId: process.env.NEXT_DEPLOYMENT_ID } : {}),
  // Keep ISR stale windows short so cached HTML/RSC cannot outlive its asset bundle for weeks.
  expireTime: 3600,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    unoptimized: true,
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
