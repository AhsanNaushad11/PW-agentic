import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js from bundling Node-only / native packages used in API routes
  serverExternalPackages: ["ollama", "@playwright/test", "playwright"],

  // Allow long-running API routes (script generation + execution can take up to 90s)
  experimental: {},
};

export default nextConfig;
