// @ts-check
const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Image domains for external images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'maps.googleapis.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 's1.ticketm.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
        pathname: '/**',
      },
    ],
  },

  // Experimental features
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
      // Limit body size for server actions (1MB)
      bodySizeLimit: '1mb',
    },
  },

  // Enhanced security headers
  async headers() {
    // Content Security Policy - adjust as needed for your app
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Required for Next.js
      "style-src 'self' 'unsafe-inline'", // Required for styled-jsx and CSS-in-JS
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      // Heatmap (maplibre-gl) needs OpenFreeMap tile endpoint + websockets for Pusher.
      // AI origins removed (PR #65 — no AI surface in v1).
      "connect-src 'self' https://*.pusher.com wss://*.pusher.com https://tiles.openfreemap.org",
      // Heatmap tile rendering uses Web Workers loaded from a blob: URL.
      "worker-src 'self' blob:",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; ');

    return [
      // CORS headers for API routes — must precede the catch-all entry
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NEXTAUTH_URL || 'http://localhost:3000',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, x-api-key',
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
          {
            key: 'Access-Control-Max-Age',
            value: '86400',
          },
        ],
      },
      // Security headers applied to all routes
      {
        source: '/:path*',
        headers: [
          // DNS Prefetch - improves performance
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          // HSTS - Enforce HTTPS (2 years, include subdomains, preload eligible)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // Clickjacking protection
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          // Prevent MIME type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Control referrer information
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Restrict browser features/permissions
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: cspDirectives,
          },
          // Prevent XSS attacks (legacy, CSP is preferred)
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },

  // Redirects
  async redirects() {
    return [
      {
        source: '/dashboard',
        destination: '/trips',
        permanent: true,
      },
    ];
  },
};

// Sentry webpack plugin options.
// https://github.com/getsentry/sentry-webpack-plugin#options
const sentryWebpackPluginOptions = {
  // Suppress sourcemap upload logs during builds.
  silent: true,

  // Hides source maps from generated client bundles.
  hideSourceMaps: true,

  // Tree-shake the Sentry logger out of the production bundle.
  // disableLogger is deprecated — use webpack.treeshake.removeDebugLogging instead.
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
};

module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions);
