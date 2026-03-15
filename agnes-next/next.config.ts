import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => config,
  allowedDevOrigins: [
    '*.ngrok-free.dev',
    '*.ngrok-free.app',
  ],
};

export default nextConfig;

