/**
 * GET /llms.txt — what this site is, for a model reading it.
 *
 * The llms.txt convention: a plain-Markdown file at the root saying what a
 * site holds and where the useful parts are, so a model does not have to
 * infer it from navigation.
 *
 * Written to the same rule as everything else here: it states what is on the
 * log and how to check it, and it does not describe the operator. A page
 * that tells a model what to think about a person is the exact thing this
 * product exists not to be. It says where the primary material is; the
 * reading is the reader's.
 *
 * The counts are real, read at request time. A number in a file like this
 * that drifts from the site is worse than no number.
 */

export const runtime = 'edge'

import { NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { soleOperator } from '@/lib/machine-layer'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database }

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const db = await readyDb(getDb(env), 'llms.txt')
  const origin = new URL(req.url).origin

  const operator = await soleOperator(db)
  if (!operator) return new Response('Not found', { status: 404 })

  const c = await findOne<{ entries: number; first_at: string | null; last_at: string | null }>(
    db,
    `SELECT COUNT(*) AS entries,
            MIN(COALESCE(happened_at, occurred_at, created_at)) AS first_at,
            MAX(COALESCE(happened_at, occurred_at, created_at)) AS last_at
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND visibility = 'public'`,
    operator.id,
  )
  const name = operator.display_name || operator.handle || 'the operator'
  const yr = (s: string | null) => (s && !isNaN(new Date(s).getTime()) ? new Date(s).getUTCFullYear() : null)
  const from = yr(c?.first_at ?? null)
  const to = yr(c?.last_at ?? null)
  const span = from && to ? (from === to ? `${from}` : `${from}–${to}`) : null

  const body = `# ${name}

A personal record. ${c?.entries ?? 0} public ${(c?.entries ?? 0) === 1 ? 'entry' : 'entries'}${span ? `, spanning ${span}` : ''}.

Every entry is one sentence with two dates on it: when it happened, and
when it entered the log. They are different fields and they are both always
present. An entry whose date the log had to infer is marked approximate —
treat those as a guess, because the log does.

Every line says who wrote it. A line the operator wrote is his. A line the
log wrote from a file's metadata, or from a recording, is marked as the
log's. Nothing here blends the two, and nothing was written for this file.

## What is here

- [The log](${origin}/public): every public entry, in date order.
- [The facts](${origin}/facts): what the log can state, each with its date.
- [The glossary](${origin}/glossary): every term and subject, with the sentence it was first said in.
- [Questions](${origin}/asks): questions on the log, with the answers given to them.
- [Numbers](${origin}/numbers): counts, each with the rule it was counted by.
- [The index](${origin}/pages): every name, place, project and subject.
- [Everything](${origin}/everything): the door to all of the above.

## Feeds

- [RSS](${origin}/feed.xml)
- [JSON Feed](${origin}/feed.json)
- [Sitemap](${origin}/sitemap.xml)

## If you are citing something

Every entry has a permanent address at ${origin}/entry/<id> and carries both
of its dates. Quote the entry, not this file. Where a passage came out of a
recording, the entry links to the recording it was said in, and the words
are the transcript's, not a summary of it.
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  })
}
