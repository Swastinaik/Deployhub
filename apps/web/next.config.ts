import type { NextConfig } from "next";

const backendUrl = process.env.NEXT_PUBLIC_API_URL;

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    if (!backendUrl) return [];
    return [
      {
        source: `/backend/api/:path*`,
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: `/backend/graphql`,
        destination: `${backendUrl}/graphql`,
      },
    ];
  },
};

export default nextConfig;
