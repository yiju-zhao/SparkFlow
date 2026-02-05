import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",
  experimental: {
    turbopackUseSystemTlsCerts: true,
    serverActions: {
      bodySizeLimit: "20mb",
    },
    // Optimize barrel file imports for faster cold starts
    optimizePackageImports: ["lucide-react", "framer-motion", "recharts"],
  },
  // Allow dev server access from local network IPs (for remote development)
  allowedDevOrigins: ["10.218.163.144", "*.local"],
};

export default nextConfig;
