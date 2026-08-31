/**
 * GET /podcast/audio/[vlog_id].mp3
 *
 * Public — redirects podcast clients to a freshly presigned R2 URL for
 * the stitched MP3. No auth (podcast apps don't carry session cookies).
 * Only returns 302 when the underlying vlog has is_podcast=1; anything
 * else 404s so we never leak private audio via this endpoint.
 *
 * The {vlog_id}.mp3 shape (rather than ?id=) keeps URLs file-like for
 * podcast clients that key downloads on the path's final segment.
 */

export const runtime = 'edge'

import { NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database }

export async function GET(_req: NextRequest, ctx: { params: Promise<{ vlog_id: string }> }) {
  const env = getRequestContext().env as unknown as Env
  const { vlog_id: raw } = await ctx.params
  // Strip the trailing .mp3 so the route handles both /podcast/audio/{id}.mp3
  // and /podcast/audio/{id} consistently.
  const vlog_id = raw.replace(/\.mp3$/i, '')

  const db = getDb(env)
  const vlog = await findOne<{
    id: string
    operator_id: string
    is_podcast: number
  }>(
    db,
    `SELECT id, operator_id, is_podcast
       FROM vlogs
      WHERE id = ? AND deleted_at IS NULL`,
    vlog_id,
  )
  if (!vlog || vlog.is_podcast !== 1) {
    return new Response('not found', { status: 404 })
  }

  const mp3Key = `${vlog.operator_id}/audio/${vlog.id}/mp3.full`
  try {
    const head = await env.VIDEOS.head(mp3Key)
    if (!head) {
      return new Response('audio not ready', { status: 503 })
    }
  } catch {
    return new Response('audio not ready', { status: 503 })
  }

  const url = await presignGetUrl(env, mp3Key, 3600)
  return Response.redirect(url, 302)
}
