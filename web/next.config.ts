import type { NextConfig } from 'next';
import path from 'node:path';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Docker/self-hosting: a minimal server bundle. Vercel ignores this.
  output: process.env.SIGHTLINE_STANDALONE ? 'standalone' : undefined,
  // The audit engine lives in ../src/engine and is shared with the desktop app, CLI and MCP server.
  experimental: { externalDir: true },
  outputFileTracingRoot: path.join(__dirname, '..'),
  // Loaded by Node at runtime from web/node_modules (not bundled), so engine files outside this folder can use it.
  serverExternalPackages: ['cheerio'],
  async rewrites() {
    return [{ source: '/app', destination: '/app/index.html' }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // The browser app is a static bundle that updates with every deploy: always revalidate.
      { source: '/app/:path*', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },
};

export default config;
