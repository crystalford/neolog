/**
 * Cloudflare Access — operator identity at the edge.
 *
 * Cloudflare Access sits in front of neolog.ai. Every authenticated request
 * arrives with two headers:
 *
 *   Cf-Access-Authenticated-User-Email   → operator's email address
 *   Cf-Access-Jwt-Assertion              → signed JWT with the same claims
 *
 * The Access app is configured (by the bootstrap workflow) to allow only
 * the operator's email. So any request that reaches the app has already been
 * authenticated as the operator — we just read the email header to know who
 * they are.
 *
 * For defense-in-depth against misconfigured routes, JWT verification can be
 * added later. For initial deployment, trusting the header is acceptable
 * because the Access policy gates the entire domain.
 *
 * Local-dev mode (no Access in front): falls back to the value of the
 * `NEOLOG_DEV_OPERATOR_EMAIL` env var so the app is usable in `wrangler dev`.
 */

import { getDb, findOne, run } from './d1'
import { ulid } from './ulid'
import type { D1Database } from '@cloudflare/workers-types'

const HEADER_EMAIL = 'Cf-Access-Authenticated-User-Email'
const HEADER_JWT = 'Cf-Access-Jwt-Assertion'

/**
 * Detect a Cloudflare Access *service token* on the request.
 *
 * When a service token authenticates (CF-Access-Client-Id / -Secret headers
 * validated by Access), Cloudflare injects a Cf-Access-Jwt-Assertion whose
 * payload carries a `common_name` claim (the token's name/client-id) and NO
 * `email` claim. Human SSO sessions carry `email` instead.
 *
 * Returns the common_name string when the request is service-token-auth'd,
 * else null. We don't verify the JWT signature — Access already did before
 * the request reached us (same trust model as the email cookie path).
 */
function readServiceTokenName(request: Request): string | null {
  const jwt = request.headers.get(HEADER_JWT)
  if (!jwt) return null
  try {
    const payload = jwt.split('.')[1]
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { email?: string; common_name?: string }
    if (!decoded.email && decoded.common_name) return decoded.common_name
  } catch {
    // Malformed — not a usable service-token assertion.
  }
  return null
}

export interface Operator {
  id: string
  email: string
  display_name: string | null
  handle: string | null
  bio: string | null
  background: string | null
  current_focus: string | null
  tz: string
  default_voice_profile_id: string | null
  public_share_enabled: number
  created_at: string
  updated_at: string
}

/**
 * Read the authenticated email from the incoming request. Tries, in order:
 *
 *   1. Cf-Access-Authenticated-User-Email header (set when the Access app
 *      is configured to forward identity headers).
 *   2. CF_Authorization cookie — parse the JWT payload and read `.email`.
 *      Set by Access for any authenticated session, even when header
 *      forwarding isn't on. This is the path Cloudflare Pages projects
 *      actually take.
 *   3. NEOLOG_DEV_OPERATOR_EMAIL env var (local dev only).
 *
 * Returns null when none of these yield an email.
 */
export function readEmail(request: Request, env: { NEOLOG_DEV_OPERATOR_EMAIL?: string }): string | null {
  const fromHeader = request.headers.get(HEADER_EMAIL)
  if (fromHeader) return fromHeader.toLowerCase()

  // Parse CF_Authorization JWT cookie. Cloudflare gates the request before
  // it reaches us, so we don't re-verify the signature — we just decode the
  // payload (base64url) and trust the email claim.
  const cookie = request.headers.get('cookie') || ''
  const match = /CF_Authorization=([^;]+)/.exec(cookie)
  if (match) {
    try {
      const payload = match[1].split('.')[1]
      const decoded = JSON.parse(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
      ) as { email?: string }
      if (decoded.email) return decoded.email.toLowerCase()
    } catch {
      // Malformed cookie — fall through to dev/env fallback.
    }
  }

  // Local-dev fallback.
  if (env.NEOLOG_DEV_OPERATOR_EMAIL) return env.NEOLOG_DEV_OPERATOR_EMAIL.toLowerCase()
  return null
}

/**
 * Look up the operator row by email. Returns null when no row exists yet
 * (operator hasn't been provisioned). Callers usually want
 * `getOrCreateOperator` instead.
 */
export async function getOperatorByEmail(db: D1Database, email: string): Promise<Operator | null> {
  return findOne<Operator>(
    db,
    'SELECT * FROM operator WHERE email = ? LIMIT 1',
    email.toLowerCase(),
  )
}

/**
 * Get the operator row for the authenticated email, creating it on first
 * sign-in. This is the standard entry point for any request handler.
 *
 * Returns null only if the request is unauthenticated (no Access header).
 * Throws if D1 is unreachable.
 */
export async function getOrCreateOperator(
  request: Request,
  env: { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string },
): Promise<Operator | null> {
  const email = readEmail(request, env)
  if (!email) {
    // No human email. Check for a Cloudflare Access service-token identity.
    // The request already passed Access (else it'd be 302'd at the edge), so
    // a service token reaching us is trusted. Single-operator app → resolve
    // to the sole operator row. This is what lets automated callers (the
    // GitHub Actions admin probe) authenticate without a human SSO session.
    const svc = readServiceTokenName(request)
    if (svc) {
      const db = getDb(env)
      const sole = await findOne<Operator>(db, 'SELECT * FROM operator ORDER BY created_at ASC LIMIT 1')
      if (sole) return sole
    }
    return null
  }

  const db = getDb(env)
  const existing = await getOperatorByEmail(db, email)
  if (existing) return existing

  const id = ulid()
  await run(
    db,
    `INSERT INTO operator (id, email, display_name, tz)
     VALUES (?, ?, NULL, 'America/Toronto')`,
    id, email,
  )
  const created = await getOperatorByEmail(db, email)
  if (!created) throw new Error(`Operator insert succeeded but row not visible: ${email}`)
  return created
}

/**
 * Convenience for route handlers that need to fail fast on unauthenticated
 * requests. Returns the operator or throws an error you can convert to a 401
 * Response.
 */
export async function requireOperator(
  request: Request,
  env: { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string },
): Promise<Operator> {
  const op = await getOrCreateOperator(request, env)
  if (!op) throw new UnauthenticatedError()
  return op
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('No Cloudflare Access identity on request')
    this.name = 'UnauthenticatedError'
  }
}
