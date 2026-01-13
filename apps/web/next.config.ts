import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  // Allow dev server access from any origin (for remote development)
  allowedDevOrigins: ["*"],
};

export default nextConfig;
