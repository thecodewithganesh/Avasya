import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const apiOrigin =
      process.env.SERVER_SIDE_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:58000";

    return [
      {
        source: "/backend-api/:path*",
        destination: `${apiOrigin.replace(/\/$/, "")}/:path*`,
      },
      // The app renders every route through the Shell (components/avasya-app.tsx
      // pathname router); /demo needs a concrete route for the URL to resolve.
      { source: "/demo", destination: "/" },
    ];
  },
};

export default nextConfig;
