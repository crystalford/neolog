/**
 * Next.js edge middleware — minimal.
 *
 * The previous middleware rewrote unauthed `/` to `/landing`. That's
 * gone: Timeline at `/` is now the canon landing for unauthed visitors
 * too. The Timeline page itself detects 401 from /api/v2/timeline and
 * renders a public-mode variant (fetching /api/p instead).
 *
 * /landing route still exists temporarily but redirects to / if you
 * hit it directly; it's slated for deletion once we're sure no
 * external links point there.
 *
 * Cloudflare Access is still the auth boundary at the edge layer —
 * it lets /, /signin, /p/*, /api/p/* through unauthenticated, gates
 * everything else by JWT.
 */

import { NextRequest, NextResponse } from 'next/server'

export const config = {
  matcher: ['/landing'],
}

export function middleware(req: NextRequest) {
  // /landing is dead — fold into Timeline.
  const url = req.nextUrl.clone()
  url.pathname = '/'
  return NextResponse.redirect(url)
}
