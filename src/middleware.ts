/**
 * Next.js edge middleware — public-vs-authed routing.
 *
 * Cloudflare Access historically gated every request to neolog.ai
 * before it hit Pages, which meant the landing page at /landing was
 * unreachable to unauthenticated visitors. The operator wanted
 * neolog.ai/ to feel like a real public site.
 *
 * This middleware runs on the root path `/` only. It checks for the
 * Cloudflare Access JWT cookie (CF_Authorization) — if present,
 * Timeline renders. If absent, rewrites to /landing so the URL stays
 * neolog.ai/ but the public marketing page is served.
 *
 * Operator action required (one-time): in the Cloudflare Access
 * dashboard, exclude `/` and `/landing` from the protected paths
 * list. The rest of the app (every (app) route + /api/v2/*) keeps
 * its existing edge auth gating.
 *
 * Why a rewrite, not a redirect: rewrite keeps the URL bar at /,
 * which is the public-facing identity. A redirect would surface
 * /landing in the address bar, which the operator doesn't want
 * (the landing IS the home page for unauthed visitors).
 */

import { NextRequest, NextResponse } from 'next/server'

export const config = {
  // Run only on / and /landing — no need to touch every request.
  matcher: ['/', '/landing'],
}

export function middleware(req: NextRequest) {
  const cookie = req.cookies.get('CF_Authorization')?.value
  const path = req.nextUrl.pathname

  // Unauthed visitor hitting / → serve landing (rewrite, not redirect).
  if (path === '/' && !cookie) {
    const url = req.nextUrl.clone()
    url.pathname = '/landing'
    return NextResponse.rewrite(url)
  }

  // Authed visitor on /landing → bounce to /. They probably typed
  // it manually; landing is for logged-out only.
  if (path === '/landing' && cookie) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}
