/**
 * POST /api/v2/chat/attachment
 *
 * Upload an attachment (image or text) for the chat. Images go to R2 and are
 * returned as a presigned URL the next chat call references inline. Text is
 * stored on the chat_attachments row directly and inlined into the chat
 * message body.
 *
 * Multipart formdata:
 *   file:       binary image OR text file
 *   thread_id?: optional, attached to a specific thread
 *   kind?:      'image' | 'text' | 'pdf'  (inferred from mime if omitted)
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { putObject, presignGetUrl, type R2Env } from '@/lib/r2'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const formData = await req.formData().catch(() => null)
  if (!formData) {
    return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 })
  }
  const threadId = (formData.get('thread_id') as string | null) || null
  const explicitKind = (formData.get('kind') as string | null) || null

  const mime = file.type || 'application/octet-stream'
  const kind =
    explicitKind ||
    (mime.startsWith('image/') ? 'image' :
     mime === 'application/pdf' ? 'pdf' :
     mime.startsWith('text/') ? 'text' : 'image')

  const id = ulid()
  const db = getDb(env)

  if (kind === 'text') {
    const text = await file.text()
    await run(
      db,
      `INSERT INTO chat_attachments
         (id, operator_id, thread_id, kind, filename, mime_type, size_bytes, text_body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, operator.id, threadId, 'text', file.name, mime, file.size, text,
    )
    return NextResponse.json({
      id,
      kind,
      filename: file.name,
      size_bytes: file.size,
      text_body: text.slice(0, 200_000),  // safety cap for the response
    })
  }

  // Binary blob (image / pdf) — write to R2
  const ext = guessExt(file.name, mime)
  const r2Key = `${operator.id}/chat/${threadId || 'unscoped'}/${id}.${ext}`
  const bytes = await file.arrayBuffer()
  await putObject(env, r2Key, bytes, {
    httpMetadata: { contentType: mime },
  })
  await run(
    db,
    `INSERT INTO chat_attachments
       (id, operator_id, thread_id, kind, filename, mime_type, size_bytes, r2_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, operator.id, threadId, kind, file.name, mime, file.size, r2Key,
  )

  let url: string | null = null
  try { url = await presignGetUrl(env, r2Key, 24 * 3600) } catch {}

  return NextResponse.json({
    id,
    kind,
    filename: file.name,
    size_bytes: file.size,
    mime_type: mime,
    url,
  })
}

function guessExt(filename: string, mime: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename || '')
  if (m) return m[1].toLowerCase()
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'application/pdf') return 'pdf'
  return 'bin'
}
