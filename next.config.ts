import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.KIDLOOP_BUILD_DIR || ".next",
  async headers() {
    return ["/invite/:path*", "/login"].map(source => ({
      source,
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    }));
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default nextConfig;
