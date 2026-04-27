import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "1gb",
    },
    // Optimize barrel file imports for faster cold starts and smaller bundles
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "echarts",
      "date-fns",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-slot",
      "@radix-ui/react-tabs",
      "@tanstack/react-query",
      "@langchain/core",
      "@langchain/langgraph-sdk",
      "react-markdown",
      "katex",
      "zod",
      "uuid",
    ],
  },
  // Prevent Turbopack from bundling native/heavy server-only packages
  serverExternalPackages: [
    "playwright",
    "pg",
    "@prisma/adapter-pg",
    "jszip",
    "graphology",
    "graphology-communities-louvain",
    "openai",
    "bcryptjs",
  ],
  // Allow dev server access from local network IPs (for remote development)
  allowedDevOrigins: ["10.218.163.144", "*.local"],
};

export default withNextIntl(nextConfig);
