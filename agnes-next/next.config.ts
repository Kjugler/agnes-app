import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => config,
  // Support ngrok in dev: add your ngrok URL here if you see cross-origin warnings
  // experimental: {
  //   allowedDevOrigins: ['https://your-ngrok-url.ngrok-free.dev'],
  // },
};

export default nextConfig;

