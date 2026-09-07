/**
 * GET  /api/v2/log/correspondence — the threads he has forwarded in.
 * POST /api/v2/log/correspondence — bring one in.
 *
 * `messages.html`: "Messages arrive one way: **you send them**... The log
 * doesn't connect to your accounts and pull conversations." There is no
 * ingest connector here and there will not be one. This route is the only
 * way a conversation gets onto the log, and it requires a paste.
 *
 * ── What POST writes, and what it refuses to ─────────────────────────────
 *
 * His messages become `log_entries` under the normal rules. Theirs are
 * written to `correspondence_messages` and stop there — never an entry,
 * because an entry carries `author='operator'`.
 *
 * `mine` names the label that is his. It is required whenever neither side
 * is labelled "You": guessing which of two names is the operator would, when
 * wrong, file another person's sentences as things he said. The request is
 * refused with the speakers it found so the caller can ask him.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, run, batch as d1Batch } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { splitThread, speakersIn, type ParsedMessage } from '@/lib/correspondence'
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
  const db = await readyDb(getDb(env), 'correspondence')

  const threads = await findMany<{
    id: string; person_name: string; person_page_id: string | null
    medium: string; started_at: string | null; ended_at: string | null
    message_count: number; created_at: string; consent: string | null
  }>(
    db,
    `SELECT c.id, c.person_name, c.person_page_id, c.medium, c.started_at,
            c.ended_at, c.message_count, c.created_at,
            p.consent
       FROM correspondence c
       LEFT JOIN pages p ON p.id = c.person_page_id AND p.deleted_at IS NULL
      WHERE c.operator_id = ? AND c.deleted_at IS NULL
      ORDER BY COALESCE(c.started_at, c.created_at) DESC
      LIMIT 200`,
    operator!.id,
  )
  return NextResponse.json({ threads }, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * Read a message's clock out of the paste, relative to the day the thread
 * says it is on. A bare "22:19" has no date of its own, so it takes the day
 * from the last dated message above it — which is exactly how the thread
 * reads on a phone, and is not an inference about anything the log was not
 * told.
 *
 * When the paste carries no clock at all, the message keeps its ORDER and
 * gets no time. §11: "A source that carries no clock gets a date and no
 * time... and never fills in a plausible time."
 */
function placeMessages(parsed: ParsedMessage[], startedAt: string | null): {
  sent_at: string | null; source: 'paste' | 'order'
}[] {
  let day: string | null = startedAt ? startedAt.slice(0, 10) : null
  return parsed.map(p => {
    const raw = (p.sent_at_raw || '').trim()
    if (!raw) return { sent_at: null, source: 'order' as const }

    // A full date in the stamp resets the day everything after it sits on.
    const dated = Date.parse(raw.length > 6 ? raw : '')
    if (!isNaN(dated)) {
      const iso = new Date(dated).toISOString()
      day = iso.slice(0, 10)
      return { sent_at: iso, source: 'paste' as const }
    }
    const hm = /^(\d{1,2})[:.](\d{2})\s*([ap]m)?$/i.exec(raw)
    if (hm && day) {
      let h = parseInt(hm[1], 10)
      const min = parseInt(hm[2], 10)
      const ampm = (hm[3] || '').toLowerCase()
      if (ampm === 'pm' && h < 12) h += 12
      if (ampm === 'am' && h === 12) h = 0
      if (h < 24 && min < 60) {
        return {
          sent_at: `${day}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`,
          source: 'paste' as const,
        }
      }
    }
    return { sent_at: null, source: 'order' as const }
  })
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await operatorOr401(req, env)
  if (error) return error
  const db = await readyDb(getDb(env), 'correspondence')

  const body = await req.json().catch(() => ({})) as {
    text?: string
    mine?: string
    person_name?: string
    person_page_id?: string
    medium?: string
    started_at?: string
  }
  const text = (body.text || '').trim()
  if (!text) return NextResponse.json({ error: 'nothing to read' }, { status: 400 })

  const parsed = splitThread(text, body.mine || null)
  const speakers = speakersIn(parsed)
  if (parsed.length < 2) {
    return NextResponse.json(
      { error: "that doesn't read as a conversation", speakers },
      { status: 400 },
    )
  }
  // Which side is his has to be known, not guessed. When it isn't, nothing
  // is written and the speakers come back so he can say.
  if (!parsed.some(p => p.side === 'operator')) {
    return NextResponse.json(
      { error: 'which of these is you?', speakers, needs: 'mine' },
      { status: 409 },
    )
  }
  const otherName = (body.person_name || '').trim()
    || parsed.find(p => p.side === 'other')?.speaker
    || 'them'

  const startedAt = body.started_at || null
  const placed = placeMessages(parsed, startedAt)
  const times = placed.map(p => p.sent_at).filter(Boolean) as string[]

  const threadId = ulid()
  await run(
    db,
    `INSERT INTO correspondence
       (id, operator_id, person_page_id, person_name, medium, started_at,
        ended_at, message_count, raw)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    threadId, operator!.id, body.person_page_id || null, otherName,
    body.medium || 'text',
    times.length ? times[0] : startedAt,
    times.length ? times[times.length - 1] : null,
    parsed.length,
    // The whole paste is kept. Nothing is reconstructed from the parts.
    text.slice(0, 200_000),
  )

  const statements: { sql: string; binds: unknown[] }[] = []
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i]
    const t = placed[i]
    const messageId = ulid()
    let entryId: string | null = null

    // His side becomes an entry. Theirs never does.
    if (p.side === 'operator' && p.text.split(/\s+/).length >= 4) {
      entryId = ulid()
      const at = t.sent_at || times[0] || new Date().toISOString()
      statements.push({
        sql: `INSERT INTO log_entries
                (id, operator_id, text, detail, occurred_at, happened_at, logged_at,
                 date_precision, kind, visibility, author, source_kind, source_ref)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        binds: [
          entryId, operator!.id, p.text, null, at, at, new Date().toISOString(),
          // A message with no clock of its own is dated to the day and said
          // to be so, rather than given a plausible time.
          t.source === 'paste' ? 'exact' : 'day',
          'said',
          // His own words in a conversation are his, under the normal rules.
          'public',
          'operator',
          'message',
          `message:${messageId}`,
        ],
      })
    }

    statements.push({
      sql: `INSERT INTO correspondence_messages
              (id, thread_id, operator_id, side, speaker, text, sent_at,
               sent_at_source, position, entry_id)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      binds: [
        messageId, threadId, operator!.id, p.side, p.speaker, p.text,
        t.sent_at, t.source, i, entryId,
      ],
    })
  }

  for (let i = 0; i < statements.length; i += 40) {
    await d1Batch(db, statements.slice(i, i + 40))
  }

  return NextResponse.json(
    {
      id: threadId,
      person_name: otherName,
      messages: parsed.length,
      // What he is told after: one line saying what happened.
      entries_written: statements.filter(s => s.sql.includes('log_entries')).length,
      href: `/messages/${threadId}`,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
