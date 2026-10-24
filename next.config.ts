import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  outputFileTracingIncludes: {
    "/dashboard/billing/**/*": ["./lib/billing/fonts/*"],
    "/dashboard/billing": ["./lib/billing/fonts/*"],
  },
};

export default nextConfig;
