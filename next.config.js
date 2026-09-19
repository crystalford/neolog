// ⚠️ Gated on NODE_ENV, not called unconditionally.
// Next's own build process exposes `globalThis.AsyncLocalStorage` (it uses
// AsyncLocalStorage internally for request context), which is exactly the
// signal the adapter's own dev/build differentiator relies on — so an
// unconditional call here also fires during `next build`, tries to open a
// remote wrangler proxy session, and fails outside an interactive shell
// with no CLOUDFLARE_API_TOKEN set. `next build`/`next start` never hit
// this branch at all.
if (process.env.NODE_ENV === 'development') {
  const { initOpenNextCloudflareForDev } = require('@opennextjs/cloudflare')
  initOpenNextCloudflareForDev()
}

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
