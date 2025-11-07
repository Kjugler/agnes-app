import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => config,
  // Allow ngrok origin for dev (if needed)
  // Note: Next.js 15 may handle this differently - adjust if you see CORS issues
};

export default nextConfig;

