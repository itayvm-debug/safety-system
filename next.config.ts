import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';

// connect-src: allow Supabase REST + realtime WebSocket + storage
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseWs  = supabaseUrl.replace(/^https/, 'wss').replace(/^http/, 'ws');

const csp = [
  "default-src 'self'",
  // Next.js requires unsafe-inline for its inline scripts; unsafe-eval for webpack runtime
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${supabaseUrl} ${supabaseWs} https://*.supabase.co wss://*.supabase.co`,
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy',   value: csp },
          { key: 'X-Frame-Options',            value: 'DENY' },
          { key: 'X-Content-Type-Options',     value: 'nosniff' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
          // HSTS only in production (prevents localhost issues during development)
          ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
        ],
      },
      {
        // sw.js must never be HTTP-cached so browsers always fetch the latest version
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma',        value: 'no-cache' },
        ],
      },
    ];
  },
};

export default nextConfig;
