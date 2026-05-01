import type { NextConfig } from "next";

/** Set at `next build` time — visible on /signal-room when NEXT_PUBLIC_SIGNAL_ROOM_BUILD_MARKER=1 */
const buildStamp = new Date().toISOString();
const gitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_REF || "local";

const nextConfig: NextConfig = {
  // No-op comment: deployment trigger for Vercel branch sync.
  reactStrictMode: true,
  webpack: (config) => config,
  allowedDevOrigins: [
    'simona-nonindictable-pseudoapoplectically.ngrok-free.dev',
  ],
  env: {
    NEXT_PUBLIC_BUILD_STAMP: buildStamp,
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
};

export default nextConfig;

