import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  // Allow localtunnel domains in dev
  allowedDevOrigins: ['*.loca.lt'],

  // Optimized standalone output for Vercel deployment
  // output: 'standalone',

  // Enforce strict TypeScript checks in production builds
  typescript: { ignoreBuildErrors: false },

  // Disable x-powered-by header for security
  poweredByHeader: false,

  // React strict mode for catching potential problems
  reactStrictMode: true,

  // Silence Turbopack warning in dev (serwist adds a webpack config)
  turbopack: {},

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'xvucakstcmtfoanmgcql.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  // Security headers (additional to middleware)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
