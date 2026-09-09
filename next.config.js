/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // ⚠️ No redirects, on purpose. `/dashboard/*` used to funnel into
  // `/timeline` "so old bookmarks keep working" — and `/timeline` was removed
  // on 8 Sep with the rest of the video-essay studio, so the redirect sent a
  // bookmark from one page that does not exist to another. CLAUDE.md's rule
  // for every removed surface: they do not redirect, because a redirect
  // preserves a bookmark to a product that no longer exists.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
