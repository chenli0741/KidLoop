import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.KIDLOOP_BUILD_DIR || ".next",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default nextConfig;
