/**
 * GET /api/v2/admin/bindings-check
 *
 * Read-only. Returns which Cloudflare bindings + secrets are present on
 * the Pages env, so the operator can diagnose "everything 5xx'd" without
 * spending any money. Particularly useful when bulk reprocess fails for
 * every chunk because PIPELINE or HEARTBEAT_TOKEN isn't wired through
 * the deployment_configs.
 *
 * No values returned for secrets — just presence. Safe to call without
 * exposing tokens.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB?: D1Database
  PROCESS_UPLOAD?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  PIPELINE?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  HEARTBEAT_TOKEN?: string
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  ANTHROPIC_API_KEY?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_BUCKET_NAME?: string
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  if (!env.DB) {
    return NextResponse.json({ error: 'DB binding missing — Pages env is broken' }, { status: 503 })
  }
  let operator
  try { operator = await requireOperator(req, env as any) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  // Distinguish "bound" (the object/string exists) from values.
  const has = (v: unknown): boolean => v !== undefined && v !== null && v !== ''
  const isFetcher = (v: any): boolean =>
    !!v && typeof v === 'object' && typeof v.fetch === 'function'

  const services = {
    DB: !!env.DB,
    PROCESS_UPLOAD: isFetcher(env.PROCESS_UPLOAD),
    PIPELINE: isFetcher(env.PIPELINE),
  }

  const secrets = {
    HEARTBEAT_TOKEN: has(env.HEARTBEAT_TOKEN),
    CLOUDFLARE_API_TOKEN: has(env.CLOUDFLARE_API_TOKEN),
    CLOUDFLARE_ACCOUNT_ID: has(env.CLOUDFLARE_ACCOUNT_ID),
    ANTHROPIC_API_KEY: has(env.ANTHROPIC_API_KEY),
    R2_ACCESS_KEY_ID: has(env.R2_ACCESS_KEY_ID),
    R2_SECRET_ACCESS_KEY: has(env.R2_SECRET_ACCESS_KEY),
    R2_BUCKET_NAME: has(env.R2_BUCKET_NAME),
  }

  // The specific combos that gate features:
  const ready_for = {
    bulk_dispatch: services.PIPELINE && secrets.HEARTBEAT_TOKEN,
    terminate_workflows: secrets.CLOUDFLARE_API_TOKEN && secrets.CLOUDFLARE_ACCOUNT_ID,
    terminate_dos: services.PIPELINE && secrets.HEARTBEAT_TOKEN,
    sonnet_extract: secrets.ANTHROPIC_API_KEY,
    r2_presign: secrets.R2_ACCESS_KEY_ID && secrets.R2_SECRET_ACCESS_KEY,
  }

  // Optional live probe of the PIPELINE service binding so we can tell
  // 'bound but unreachable' apart from 'bound and healthy.' We hit a
  // route that doesn't mutate anything; 404 is a healthy signal because
  // it means the service responded.
  let pipeline_probe: { reachable: boolean; status?: number; error?: string } = { reachable: false }
  if (services.PIPELINE && env.PIPELINE) {
    try {
      const r = await env.PIPELINE.fetch('https://internal/healthz', {
        method: 'GET',
      })
      pipeline_probe = { reachable: true, status: r.status }
    } catch (err: any) {
      pipeline_probe = { reachable: false, error: err?.message || String(err) }
    }
  }

  return new NextResponse(JSON.stringify({
    services,
    secrets,
    ready_for,
    pipeline_probe,
    operator_id: operator.id,
  }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
