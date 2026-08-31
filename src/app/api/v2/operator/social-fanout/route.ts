/**
 * Operator social-fanout webhook URL.
 *
 *   GET  → returns current settings
 *     { webhook_url, auto_publish_default, auto_publish_max_per_vlog }
 *
 *   PUT  → body { webhook_url?, auto_publish_default?, auto_publish_max_per_vlog?, ping? }
 *     Validates webhook_url is parseable. If ping=true, POSTs a
 *     { ping: true, source: 'neolog' } payload to the new URL to
 *     confirm reachability and reports the response status. Save still
 *     happens even if the ping fails — operator can wire it up before
 *     the Make.com scenario is fully built.
 *
 * The webhook URL is the single point of contact with the
 * social-fanout vendor (Make.com, Buffer, Zapier, or a worker the
 * operator runs themselves). When non-null, the post-upload
 * auto-promote pipeline fires this URL with each shipped clip's
 * payload.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const row = await findOne<{
    social_fanout_webhook_url: string | null
    auto_publish_default: number
    auto_publish_max_per_vlog: number
  }>(
    getDb(env),
    `SELECT social_fanout_webhook_url, auto_publish_default, auto_publish_max_per_vlog
       FROM operator WHERE id = ?`,
    operator.id,
  )
  return NextResponse.json({
    webhook_url: row?.social_fanout_webhook_url ?? null,
    auto_publish_default: row?.auto_publish_default ?? 0,
    auto_publish_max_per_vlog: row?.auto_publish_max_per_vlog ?? 2,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const body = await req.json().catch(() => ({})) as {
    webhook_url?: string | null
    auto_publish_default?: number | boolean
    auto_publish_max_per_vlog?: number
    ping?: boolean
  }
  const db = getDb(env)

  const updates: string[] = []
  const params: any[] = []

  let webhookUrl: string | null | undefined = undefined
  if (body.webhook_url !== undefined) {
    webhookUrl = body.webhook_url === null || body.webhook_url === ''
      ? null
      : String(body.webhook_url).trim()
    if (webhookUrl) {
      try { new URL(webhookUrl) }
      catch { return NextResponse.json({ error: 'webhook_url is not a valid URL' }, { status: 400 }) }
    }
    updates.push('social_fanout_webhook_url = ?')
    params.push(webhookUrl)
  }
  if (body.auto_publish_default !== undefined) {
    updates.push('auto_publish_default = ?')
    params.push(body.auto_publish_default ? 1 : 0)
  }
  if (body.auto_publish_max_per_vlog !== undefined) {
    const n = Math.max(1, Math.min(10, Number(body.auto_publish_max_per_vlog) || 2))
    updates.push('auto_publish_max_per_vlog = ?')
    params.push(n)
  }

  if (updates.length > 0) {
    await run(
      db,
      `UPDATE operator SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ...params, operator.id,
    )
  }

  let pingResult: { ok: boolean; status?: number; message?: string } | null = null
  if (body.ping && webhookUrl) {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ping: true,
          source: 'neolog',
          sent_at: new Date().toISOString(),
          note: 'Test payload from your auto-publish settings. Real payloads include mp4_url, caption, and clip metadata.',
        }),
      })
      pingResult = { ok: resp.ok, status: resp.status }
    } catch (err: any) {
      pingResult = { ok: false, message: err?.message || String(err) }
    }
  }

  return NextResponse.json({
    ok: true,
    webhook_url: webhookUrl,
    ping: pingResult,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
