import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    qualities: [75, 100],
  },
  experimental: {
    cpus: 1,
    webpackMemoryOptimizations: true,
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
