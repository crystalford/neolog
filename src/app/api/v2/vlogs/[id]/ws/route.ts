/**
 * GET /api/v2/vlogs/[id]/ws — WebSocket bridge to the VlogPipelineDO.
 *
 * Browser opens a WebSocket here; we authenticate the operator via Cloudflare
 * Access (same as every other /api/v2/* route) and proxy the upgrade to the
 * Durable Object instance keyed by vlog id. The DO sends:
 *
 *   { type: 'snapshot', vlog_id, events: PipelineEvent[] }   on connect
 *   { type: 'event', event: PipelineEvent }                  for each new event
 *
 * The browser hook auto-reconnects with exponential backoff.
 *
 * Why a DO + Hibernatable WS instead of SSE: SSE on Cloudflare Pages
 * Functions is documented but known-unreliable in production (multi-year
 * community thread; the proxy buffers events). DO Hibernatable WebSockets
 * are billed only during active JS execution and survive eviction.
 */

export const runtime = 'edge'

import { NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  PIPELINE: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try {
    operator = await requireOperator(req, env)
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return new Response('unauthenticated', { status: 401 })
    }
    throw e
  }

  if (req.headers.get('Upgrade') !== 'websocket') {
    return new Response('expected websocket', { status: 426 })
  }

  const { id: vlog_id } = await ctx.params
  if (!vlog_id) return new Response('vlog id required', { status: 400 })

  // Ownership check before opening the socket
  const row = await env.DB.prepare(
    `SELECT id FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
  ).bind(vlog_id, operator.id).first<{ id: string }>()
  if (!row) return new Response('vlog not found', { status: 404 })

  if (!env.PIPELINE) {
    return new Response(
      'PIPELINE service binding missing — re-run bootstrap-cloudflare to wire it.',
      { status: 503 },
    )
  }

  return env.PIPELINE.fetch(
    new Request(`https://internal/ws/${vlog_id}`, {
      method: 'GET',
      headers: req.headers,
    }),
  )
}
