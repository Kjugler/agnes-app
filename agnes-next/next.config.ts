import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => config,
  allowedDevOrigins: [
    'simona-nonindictable-pseudoapoplectically.ngrok-free.dev',
  ],
};

export default nextConfig;

