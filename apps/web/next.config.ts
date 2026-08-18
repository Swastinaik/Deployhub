import type { NextConfig } from "next";

const backendUrl = process.env.NEXT_PUBLIC_API_URL;

const nextConfig: NextConfig = {
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  //allowedDevOrigins: ['https://confound-flirt-identify.ngrok-free.dev'],
  /* config options here */
  async rewrites() {
    if (!backendUrl) return [];
    return [
      {
        source: `/api/:path*`,
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: `/graphql`,
        destination: `${backendUrl}/graphql`,
      },
    ];
  },
};

export default nextConfig;
