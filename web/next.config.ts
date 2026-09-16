import type { NextConfig } from "next";
import path from "path";

const API = process.env.API_ORIGIN || "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/auth/google/callback",
        destination: `${API}/api/auth/google/callback`,
      },
      {
        source: "/auth/meta/callback",
        destination: `${API}/api/auth/meta/callback`,
      },
      {
        source: "/api/:path*",
        destination: `${API}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
