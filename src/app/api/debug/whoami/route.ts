/**
 * GET /api/debug/whoami
 *
 * Does Cloudflare Access reach this function at all? The one route in the
 * product with no `requireOperator`, because it exists for the case where
 * auth is what is broken — a route that needs auth to tell you auth is
 * failing is no use.
 *
 * ⚠️ **It answers with booleans and header NAMES, never values.** The first
 * version echoed every header back, cookies included, with a truncated
 * `CF_Authorization` JWT among them. Reflecting a caller's own cookie to
 * that caller is not a leak by itself — but it is a shape that becomes one
 * the moment anything proxies, logs or caches the response, and this is the
 * only unauthenticated route here. What a diagnostic needs is whether the
 * header ARRIVED, and that is a boolean.
 *
 * The email is the exception, and it is the point of the route: it comes
 * from `Cf-Access-Authenticated-User-Email`, which Access sets for the
 * signed-in caller and nobody else. A stranger gets `null` and learns
 * nothing about the operator.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const cookie = req.headers.get('cookie') || ''
  const names: string[] = []
  req.headers.forEach((_v, k) => names.push(k.toLowerCase()))

  return NextResponse.json(
    {
      access_email_header: req.headers.has('Cf-Access-Authenticated-User-Email'),
      // Who Access says the CALLER is. Not read from the log, not the
      // operator's — the header for whoever is asking.
      you: req.headers.get('Cf-Access-Authenticated-User-Email'),
      access_cookie: cookie.includes('CF_Authorization='),
      // Header names only. A value is never returned.
      headers_seen: names.sort(),
      note:
        'Booleans and header names only. If access_email_header is false, '
        + 'the Access application is not in front of this path.',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
