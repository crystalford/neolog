/**
 * GET  /api/v2/documents — every made thing, one shape.
 * POST /api/v2/documents — keep one.
 *
 * `writing.html`: "Whole. Never split." A document goes in as one row and
 * shows on the feed as one entry saying it was made. The splitter is not
 * called and must not be: a finished piece cut into lines is destroyed.
 *
 * The entry it creates carries `author` from `made_by`, not from the fact
 * that he pressed the button. A report the log drafted and he kept is the
 * log's prose, and the feed says so.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, run } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import {
  asKind, asMadeBy, wordCount, documentSentence, DOC_KINDS,
} from '@/lib/documents'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

async function operatorOr401(req: NextRequest, env: Env) {
  try { return { operator: await requireOperator(req, env), error: null as null } }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return { operator: null, error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) }
    }
    throw e
  }
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await operatorOr401(req, env)
  if (error) return error
  const db = await readyDb(getDb(env), 'documents')

  const kind = req.nextUrl.searchParams.get('kind')
  const documents = await findMany<{
    id: string; kind: string; title: string; made_by: string; status: string
    word_count: number; draft_count: number; page_id: string | null
    page_name: string | null; visibility: string
    finished_at: string | null; created_at: string
  }>(
    db,
    `SELECT d.id, d.kind, d.title, d.made_by, d.status, d.word_count,
            d.draft_count, d.page_id, p.name AS page_name, d.visibility,
            d.finished_at, d.created_at
       FROM documents d
       LEFT JOIN pages p ON p.id = d.page_id AND p.deleted_at IS NULL
      WHERE d.operator_id = ? AND d.deleted_at IS NULL
        ${kind && (DOC_KINDS as readonly string[]).includes(kind) ? 'AND d.kind = ?' : ''}
      ORDER BY COALESCE(d.finished_at, d.created_at) DESC
      LIMIT 300`,
    ...(kind && (DOC_KINDS as readonly string[]).includes(kind)
      ? [operator!.id, kind]
      : [operator!.id]),
  )
  return NextResponse.json({ documents }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await operatorOr401(req, env)
  if (error) return error
  const db = await readyDb(getDb(env), 'documents')

  const body = await req.json().catch(() => ({})) as {
    title?: string; body?: string; kind?: string; made_by?: string
    page_id?: string; body_url?: string; note?: string
  }
  const title = (body.title || '').trim()
  if (!title) return NextResponse.json({ error: 'a document needs a title' }, { status: 400 })

  const kind = asKind(body.kind)
  const madeBy = asMadeBy(body.made_by)
  const text = (body.body || '').trim() || null
  const words = wordCount(text)
  const id = ulid()
  const now = new Date().toISOString()

  // One entry, saying it was made. Whole, and never split.
  const entryId = ulid()
  await run(
    db,
    `INSERT INTO log_entries
       (id, operator_id, text, detail, occurred_at, happened_at, logged_at,
        date_precision, kind, visibility, author, source_kind, source_ref, link_url)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    entryId, operator!.id,
    documentSentence(kind, title, madeBy),
    words ? `${words.toLocaleString('en-GB')} words.` : null,
    now, now, now, 'exact', 'made',
    // A made thing starts private. Publishing a whole document is an act,
    // and `writing.html` puts a button on it — it is not a default.
    'private',
    // Who wrote the LINE is who made the thing. The log does not sign his
    // essay, and he does not sign the log's report.
    madeBy === 'operator' ? 'operator' : 'log',
    'document', `document:${id}`,
    `/writing/${id}`,
  )

  await run(
    db,
    `INSERT INTO documents
       (id, operator_id, kind, title, body, body_url, made_by, status,
        word_count, draft_count, page_id, entry_id, visibility)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, operator!.id, kind, title, text, (body.body_url || '').trim() || null,
    madeBy, 'draft', words, 1, body.page_id || null, entryId, 'private',
  )

  // Draft one. Every draft is kept from the first.
  await run(
    db,
    `INSERT INTO document_drafts (id, document_id, operator_id, n, body, word_count, note)
     VALUES (?,?,?,?,?,?,?)`,
    ulid(), id, operator!.id, 1, text, words, (body.note || '').trim() || null,
  )

  return NextResponse.json(
    { id, entry_id: entryId, href: `/writing/${id}`, word_count: words },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
