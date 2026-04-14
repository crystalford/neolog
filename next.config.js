/** @type {import('next').NextConfig} */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      // Old routes → new routes
      { source: '/dashboard/brain',     destination: '/dashboard', permanent: false },
      { source: '/dashboard/entities',  destination: '/dashboard', permanent: false },
      { source: '/dashboard/synthesis', destination: '/dashboard', permanent: false },
      { source: '/dashboard/log',       destination: '/dashboard', permanent: false },
      { source: '/dashboard/log/new',   destination: '/dashboard', permanent: false },
      { source: '/dashboard/character', destination: '/dashboard', permanent: false },
      { source: '/dashboard/inventory', destination: '/dashboard', permanent: false },
      { source: '/dashboard/portfolio', destination: '/dashboard', permanent: false },
      { source: '/dashboard/projects',  destination: '/dashboard', permanent: false },
      { source: '/dashboard/captures',  destination: '/dashboard', permanent: false },
      { source: '/dashboard/agents',    destination: '/dashboard', permanent: false },
      { source: '/dashboard/workspace', destination: '/dashboard', permanent: false },
      { source: '/dashboard/queue',     destination: '/dashboard/posts',    permanent: false },
      { source: '/dashboard/ingest',    destination: '/dashboard/videos',   permanent: false },
      { source: '/dashboard/uploads',   destination: '/dashboard/videos',   permanent: false },
      { source: '/dashboard/sessions',  destination: '/dashboard/timeline', permanent: false },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "img-src 'self' data: https:",
              "font-src 'self' data: https:",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
              "media-src 'self' blob:",
              "connect-src 'self' https: wss:",
              "frame-src https://js.stripe.com",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

module.exports = withBundleAnalyzer(nextConfig)
