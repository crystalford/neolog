/**
 * GET   /api/v2/documents/[id] — one document and every draft of it.
 * PATCH /api/v2/documents/[id] — a new draft, a finish, or a publish.
 *
 * ── A new draft never overwrites the last one ────────────────────────────
 *
 * `writing.html`: "3 drafts, **all kept**". The same rule `entry_revisions`
 * enforces for a line: the old value is written down before the new one
 * replaces it, so a document that changed can always show what it used to
 * say. The draft rows are the record; `documents.body` is only the current
 * one.
 *
 * ── Publishing crosses untouched ─────────────────────────────────────────
 *
 * "A document you made yourself is the one kind of made thing that crosses
 * to public untouched — no reading, no reduction, no draft." So publish sets
 * a flag and a date, and runs the text through nothing. `made_by` travels
 * with it, which is the whole of the log's claim about the file.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { loadDocument, wordCount } from '@/lib/documents'
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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await operatorOr401(req, env)
  if (error) return error
  const db = await readyDb(getDb(env), 'document')
  const r = await loadDocument(db, operator!.id, params.id)
  if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // What it came out of: the entries already attached to the same page. The
  // document does not carry its own list — that would be a second place for
  // the answer to live.
  const came = r.document.page_id
    ? await (await import('@/lib/d1')).findMany<{ id: string; text: string; happened_at: string }>(
        db,
        `SELECT le.id, le.text,
                COALESCE(le.happened_at, le.occurred_at, le.created_at) AS happened_at
           FROM page_entries pe
           JOIN log_entries le ON le.id = pe.entry_id
          WHERE pe.page_id = ? AND pe.entry_kind = 'entry'
            AND le.operator_id = ? AND le.deleted_at IS NULL AND le.buried_at IS NULL
            AND le.id <> COALESCE(?, '')
          ORDER BY COALESCE(le.happened_at, le.occurred_at, le.created_at) DESC
          LIMIT 8`,
        r.document.page_id, operator!.id, r.document.entry_id,
      )
    : []

  return NextResponse.json({ ...r, came_from: came }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await operatorOr401(req, env)
  if (error) return error
  const db = await readyDb(getDb(env), 'document')

  const doc = await findOne<{
    id: string; body: string | null; draft_count: number
    word_count: number; entry_id: string | null; status: string
  }>(
    db,
    `SELECT id, body, draft_count, word_count, entry_id, status
       FROM documents WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator!.id,
  )
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    body?: string; note?: string; title?: string
    finish?: boolean; publish?: boolean; unpublish?: boolean
    page_id?: string
  }

  const sets: string[] = []
  const binds: unknown[] = []

  // A new draft. The one it replaces is already a row, so nothing is lost.
  if (typeof body.body === 'string') {
    const text = body.body.trim() || null
    if (text !== doc.body) {
      const n = (doc.draft_count || 1) + 1
      await run(
        db,
        `INSERT INTO document_drafts (id, document_id, operator_id, n, body, word_count, note)
         VALUES (?,?,?,?,?,?,?)`,
        ulid(), params.id, operator!.id, n, text, wordCount(text),
        (body.note || '').trim() || null,
      )
      sets.push('body = ?', 'word_count = ?', 'draft_count = ?')
      binds.push(text, wordCount(text), n)
    }
  }

  if (typeof body.title === 'string' && body.title.trim()) {
    sets.push('title = ?')
    binds.push(body.title.trim())
  }
  if (typeof body.page_id === 'string') {
    sets.push('page_id = ?')
    binds.push(body.page_id || null)
  }
  if (body.finish) {
    sets.push("status = 'finished'", 'finished_at = CURRENT_TIMESTAMP')
  }
  if (body.publish) {
    // Untouched. Nothing is read, reduced or redrafted here.
    sets.push("visibility = 'public'", 'published_at = CURRENT_TIMESTAMP')
  }
  if (body.unpublish) {
    // Reversible, and the entry goes back with it. SPEC §3: taking
    // something down never becomes a 404, but it does stop being public.
    sets.push("visibility = 'private'", 'published_at = NULL')
  }

  if (!sets.length) return NextResponse.json({ error: 'nothing to change' }, { status: 400 })
  sets.push('updated_at = CURRENT_TIMESTAMP')
  binds.push(params.id, operator!.id)
  await run(db, `UPDATE documents SET ${sets.join(', ')} WHERE id = ? AND operator_id = ?`, ...binds)

  // The entry on the feed follows the document's own visibility, so the log
  // never shows a made thing as public while the thing itself is not.
  if ((body.publish || body.unpublish) && doc.entry_id) {
    await run(
      db,
      `UPDATE log_entries SET visibility = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`,
      body.publish ? 'public' : 'private', doc.entry_id, operator!.id,
    )
  }

  return NextResponse.json({ ok: true, id: params.id }, { headers: { 'Cache-Control': 'no-store' } })
}
