/**
 * POST /api/v2/log/presign
 *
 * A presigned PUT for anything dropped into the intake — a photo, a voice
 * note, a PDF, a screenshot. The browser uploads straight to R2 and then
 * calls `/api/v2/log/intake` with the keys; bytes never pass through a
 * Function (CLAUDE.md — large files go direct to R2).
 *
 * Body:  { filename?: string, content_type?: string }
 * Reply: { url, key }
 *
 * Key pattern: {operator}/log/{ulid}.{ext} — a sibling of the photos and
 * vlogs prefixes, so ownership checks read the same way everywhere.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { presignPutUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

/** Keep a sane extension so R2 objects stay recognisable when listed. */
function extFor(filename: string | undefined, contentType: string | undefined): string {
  const fromName = (filename || '').match(/\.([a-z0-9]{1,5})$/i)?.[1]
  if (fromName) return fromName.toLowerCase()
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('webm')) return 'webm'
  if (ct.includes('mp4')) return 'mp4'
  if (ct.includes('mpeg')) return 'mp3'
  if (ct.includes('wav')) return 'wav'
  if (ct.includes('png')) return 'png'
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg'
  if (ct.includes('pdf')) return 'pdf'
  return 'bin'
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const body = await req.json().catch(() => ({})) as { filename?: string; content_type?: string }
  const key = `${operator.id}/log/${ulid()}.${extFor(body.filename, body.content_type)}`
  const url = await presignPutUrl(env, key, 3600)
  return NextResponse.json({ url, key }, { headers: { 'Cache-Control': 'no-store' } })
}
