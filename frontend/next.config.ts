import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // The app renders every route through the Shell (components/avasya-app.tsx
      // pathname router); /demo needs a concrete route for the URL to resolve.
      { source: "/demo", destination: "/" },
    ];
  },
};

export default nextConfig;
