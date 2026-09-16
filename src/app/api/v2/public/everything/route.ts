/**
 * GET /api/v2/public/everything — the door to the machine layer.
 *
 * `everything.html`: "the one door to the machine layer: glossary,
 * questions, numbers, the person record, feeds (RSS · JSON · llms.txt ·
 * sitemap). Linked from about and the log's footer, never the nav."
 *
 * It returns counts rather than content, because the door's job is to say
 * what is behind each address and how big it is. A door that lied about the
 * size of the room would be worse than no door: an empty list reached
 * through a link that promised forty things reads as a broken page.
 *
 * A count of zero is returned as zero and rendered as "nothing yet" — never
 * hidden, because the surfaces themselves are permanent addresses.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { lastChanged } from '@/lib/machine-layer'
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
  const db = await readyDb(getDb(env), 'everything')

  const [counts, changed] = await Promise.all([
    findOne<{
      glossary: number; questions: number; open_questions: number
      public_entries: number; entries: number; pages: number
    }>(
      db,
      `SELECT
         (SELECT COUNT(*) FROM pages
           WHERE operator_id = ?1 AND deleted_at IS NULL AND merged_into IS NULL
             AND kind IN ('term','subject','project','thing')) AS glossary,
         (SELECT COUNT(*) FROM log_entries
           WHERE operator_id = ?1 AND deleted_at IS NULL AND buried_at IS NULL
             AND author = 'operator' AND visibility = 'public'
             AND rtrim(text) LIKE '%?') AS questions,
         (SELECT COUNT(*) FROM log_entries q
           WHERE q.operator_id = ?1 AND q.deleted_at IS NULL AND q.buried_at IS NULL
             AND q.author = 'operator' AND q.visibility = 'public'
             AND rtrim(q.text) LIKE '%?'
             AND NOT EXISTS (
               SELECT 1 FROM log_entries a
                WHERE a.led_from = q.id AND a.deleted_at IS NULL AND a.buried_at IS NULL
             )) AS open_questions,
         (SELECT COUNT(*) FROM log_entries
           WHERE operator_id = ?1 AND deleted_at IS NULL AND buried_at IS NULL
             AND visibility = 'public') AS public_entries,
         (SELECT COUNT(*) FROM log_entries
           WHERE operator_id = ?1 AND deleted_at IS NULL AND buried_at IS NULL) AS entries,
         (SELECT COUNT(*) FROM pages
           WHERE operator_id = ?1 AND deleted_at IS NULL AND merged_into IS NULL) AS pages`,
      operator.id,
    ),
    lastChanged(db, operator.id),
  ])

  const c = counts || {
    glossary: 0, questions: 0, open_questions: 0,
    public_entries: 0, entries: 0, pages: 0,
  }

  return NextResponse.json(
    {
      counts: c,
      last_changed: changed,
      // The addresses, so the page renders the list rather than hard-coding
      // it in two places. `stranger` marks the ones a person would click.
      doors: [
        { href: '/public',   name: 'the log',    what: 'every entry marked public, in date order', count: c.public_entries, stranger: true },
        { href: '/facts',    name: 'the facts',  what: 'what the log can state about him, each with its date', count: null, stranger: true },
        { href: '/glossary', name: 'the glossary', what: 'every term and subject, with the sentence it was first said in', count: c.glossary, stranger: false },
        { href: '/asks',     name: 'the questions', what: 'questions on the log, and the answers he gave to them', count: c.questions, stranger: false },
        { href: '/numbers',  name: 'the numbers', what: 'what the log counts to, and the rule each was counted by', count: null, stranger: false },
        { href: '/pages',    name: 'the index',  what: 'every name, place, project and subject', count: c.pages, stranger: false },
      ],
      feeds: [
        { href: '/feed.xml',    name: 'RSS',      what: 'the public log as a feed' },
        { href: '/feed.json',   name: 'JSON Feed', what: 'the same entries, as JSON' },
        { href: '/llms.txt',    name: 'llms.txt', what: 'what this site is, for a model reading it' },
        { href: '/sitemap.xml', name: 'sitemap',  what: 'every public address' },
      ],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
