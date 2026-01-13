import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  // Allow dev server access from local network IPs (for remote development)
  allowedDevOrigins: ["10.218.163.144", "*.local"],
};

export default nextConfig;
