import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // The backend redirects to /auth/google/callback?token=<JWT>.
      // Rewrite it (server-side, URL stays the same) to the existing
      // /auth/callback page so direct navigation never returns a Vercel 404,
      // even if a nested page is missed by a deploy.
      {
        source: "/auth/google/callback",
        destination: "/auth/callback",
      },
      // Legacy/fallback callback paths
      { source: "/callback", destination: "/auth/callback" },
    ];
  },
};

export default nextConfig;
