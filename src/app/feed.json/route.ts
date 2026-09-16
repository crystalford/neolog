/**
 * GET /feed.json — the same public entries as JSON Feed 1.1.
 *
 * The two times are the point of this log, and JSON Feed has exactly two
 * date fields, so they map without loss: `date_published` is when it
 * HAPPENED and `date_modified` is when it was LOGGED. A reader sorting by
 * `date_published` gets the life; one sorting by `date_modified` gets the
 * writing of it. An extension object carries the precision, so a consumer
 * knows which dates are a guess rather than treating a marked-approximate
 * day as exact.
 */

export const runtime = 'edge'

import { NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { loadPublicFeed, soleOperator } from '@/lib/machine-layer'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database }

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const db = await readyDb(getDb(env), 'feed.json')
  const origin = new URL(req.url).origin

  const operator = await soleOperator(db)
  if (!operator) return new Response('Not found', { status: 404 })
  const rows = await loadPublicFeed(db, operator.id, 200)
  const name = operator.display_name || operator.handle || 'the log'

  return Response.json(
    {
      version: 'https://jsonfeed.org/version/1.1',
      title: name,
      home_page_url: `${origin}/public`,
      feed_url: `${origin}/feed.json`,
      description: 'A record, in order. Every entry carries the date it happened and the date it was logged.',
      authors: [{ name }],
      items: rows.map(r => ({
        id: `${origin}/entry/${r.id}`,
        url: `${origin}/entry/${r.id}`,
        title: r.text,
        content_text: r.detail ? `${r.text}\n\n${r.detail}` : r.text,
        date_published: r.happened_at,
        date_modified: r.logged_at,
        tags: [r.kind],
        // Not part of JSON Feed, and namespaced as the spec requires for
        // exactly this. Without it a consumer reads a date the log had to
        // guess as a date it was told.
        _neolog: {
          date_precision: r.date_precision,
          written_by: r.author === 'operator' ? 'the operator' : 'the log',
        },
      })),
    },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  )
}
