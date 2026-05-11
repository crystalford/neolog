/**
 * GET /api/debug/whoami
 *
 * Diagnostic endpoint that echoes back which Cloudflare Access headers
 * the request is carrying. Helps debug 401s on /api/v2/vlogs by showing
 * whether Access is actually injecting Cf-Access-Authenticated-User-Email.
 *
 * Delete this route once auth is confirmed working.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const cfAccessHeaders: Record<string, string> = {}
  const allCfHeaders: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower.startsWith('cf-')) allCfHeaders[lower] = value.slice(0, 200)
    if (lower.startsWith('cf-access')) cfAccessHeaders[lower] = value.slice(0, 200)
  })

  return NextResponse.json({
    has_email_header: req.headers.has('Cf-Access-Authenticated-User-Email'),
    email_header_value: req.headers.get('Cf-Access-Authenticated-User-Email'),
    cf_access_headers: cfAccessHeaders,
    all_cf_headers: allCfHeaders,
    note: 'If has_email_header is false, Cloudflare Access is not injecting it. Check the Access app config.',
  })
}
