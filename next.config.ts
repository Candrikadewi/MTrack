import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Baked into the client bundle: the commit this build was made from.
    // UpdateNotifier compares it with /api/version, which reports the
    // commit the server is running now, to offer a refresh after a deploy.
    NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  },
};

export default nextConfig;
