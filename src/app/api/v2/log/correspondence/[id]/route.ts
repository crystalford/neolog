/**
 * GET    /api/v2/log/correspondence/[id] — one thread, both sides, plus the
 *                                          public view under the consent
 *                                          that governs it.
 * PATCH  /api/v2/log/correspondence/[id] — set the person's consent, or
 *                                          attach the thread to their page.
 *
 * The consent is written to the PERSON'S page, not to the thread, so one
 * answer governs every thread they appear in. Answering once and finding
 * they are still quoted in another conversation would make the answer a
 * lie.
 *
 * `messages.html`: "Their yes is a fact on the log. Not a checkbox. When
 * they said it, how, for which words." So a change writes the date and the
 * note along with the state, and a state set without a note is stored as
 * exactly that — not as a state that pretends to a source.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import {
  loadThread, publicView, asConsent, CONSENT_STATES, type Consent,
} from '@/lib/correspondence'
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
  const db = await readyDb(getDb(env), 'thread')

  const t = await loadThread(db, operator!.id, params.id)
  if (!t) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json(
    {
      ...t,
      // Computed here, once, by the one function that knows the rule — the
      // page never re-derives it from the state.
      public_view: publicView(t.messages, t.consent),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await operatorOr401(req, env)
  if (error) return error
  const db = await readyDb(getDb(env), 'thread')

  const thread = await findOne<{ id: string; person_page_id: string | null; person_name: string }>(
    db,
    `SELECT id, person_page_id, person_name FROM correspondence
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator!.id,
  )
  if (!thread) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    consent?: string
    consent_note?: string
    person_page_id?: string
  }

  let pageId = thread.person_page_id
  if (typeof body.person_page_id === 'string' && body.person_page_id) {
    const page = await findOne<{ id: string }>(
      db, `SELECT id FROM pages WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
      body.person_page_id, operator!.id,
    )
    if (!page) return NextResponse.json({ error: 'no such page' }, { status: 400 })
    pageId = body.person_page_id
    await run(
      db, `UPDATE correspondence SET person_page_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND operator_id = ?`,
      pageId, params.id, operator!.id,
    )
  }

  if (typeof body.consent === 'string') {
    if (!(CONSENT_STATES as readonly string[]).includes(body.consent)) {
      return NextResponse.json({ error: 'not one of the four states' }, { status: 400 })
    }
    if (!pageId) {
      // Consent belongs to a person, and a person is a page. Without one
      // there is nowhere for the answer to live that other threads would
      // see, so it is refused rather than written somewhere weaker.
      return NextResponse.json(
        { error: 'attach this to their page first — their answer lives there, so it covers every conversation they are in' },
        { status: 409 },
      )
    }
    const state = asConsent(body.consent) as Consent
    await run(
      db,
      `UPDATE pages
          SET consent = ?, consent_at = CURRENT_TIMESTAMP, consent_note = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`,
      state, (body.consent_note || '').trim() || null, pageId, operator!.id,
    )
  }

  return NextResponse.json({ ok: true, id: params.id }, { headers: { 'Cache-Control': 'no-store' } })
}
