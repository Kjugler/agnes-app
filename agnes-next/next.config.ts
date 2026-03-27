import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No-op comment: deployment trigger for Vercel branch sync.
  reactStrictMode: true,
  webpack: (config) => config,
  allowedDevOrigins: [
    'simona-nonindictable-pseudoapoplectically.ngrok-free.dev',
  ],
};

export default nextConfig;

