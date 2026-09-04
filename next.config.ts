import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "cdn.dummyjson.com" }, { protocol: "https", hostname: "cdn.shopify.com" }] },
  turbopack: {
    // This project is intentionally nested outside the surrounding workspace.
    // Pinning the root prevents Turbopack from discovering an unrelated lockfile.
    root: process.cwd(),
  },
};

export default nextConfig;
