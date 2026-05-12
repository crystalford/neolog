/**
 * GET /api/debug/whoami
 *
 * Echoes back what Cloudflare Access is forwarding so we can see whether
 * the email header / JWT cookie / both / neither make it to the Pages
 * function. Diagnostic only — delete once auth is reliable.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const allHeaders: Record<string, string> = {}
  const cfHeaders: Record<string, string> = {}

  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    // Cap header values to avoid leaking large JWTs in full
    const v = value.length > 240 ? value.slice(0, 240) + `…[${value.length} total]` : value
    allHeaders[lower] = v
    if (lower.startsWith('cf-') || lower === 'cookie') cfHeaders[lower] = v
  })

  // Try to extract email from CF_Authorization cookie JWT
  let jwt_email: string | null = null
  let jwt_error: string | null = null
  const cookieHeader = req.headers.get('cookie') || ''
  const match = /CF_Authorization=([^;]+)/.exec(cookieHeader)
  if (match) {
    try {
      const payload = match[1].split('.')[1]
      const decoded = JSON.parse(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
      )
      jwt_email = decoded.email || decoded.identity_nonce || null
    } catch (err: any) {
      jwt_error = err.message
    }
  }

  return NextResponse.json({
    has_cf_access_email_header: req.headers.has('Cf-Access-Authenticated-User-Email'),
    cf_access_email_header_value: req.headers.get('Cf-Access-Authenticated-User-Email'),
    has_cf_authorization_cookie: cookieHeader.includes('CF_Authorization='),
    jwt_email,
    jwt_error,
    cf_headers: cfHeaders,
    all_header_keys: Object.keys(allHeaders),
  })
}
