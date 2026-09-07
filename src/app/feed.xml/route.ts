/**
 * GET /feed.xml — the public log as RSS 2.0.
 *
 * `everything.html` lists four feeds; this is the one a reader subscribes
 * to. Only entries marked public are ever selected (`loadPublicFeed`), so
 * this route can be served without auth the way `/podcast.xml` is.
 *
 * An entry is one sentence, so it is the item's title AND its description —
 * padding it out with anything the log wrote would put a second author in a
 * feed that claims to be his. A `detail` he wrote goes in the description
 * under the line; a detail the log wrote is marked as the log's.
 *
 * Serving this to the open web is one Cloudflare Access bypass app, and that
 * act is the operator's. Until he adds it, the address exists and returns
 * the right bytes to him.
 */

export const runtime = 'edge'

import { NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { loadPublicFeed, soleOperator, xmlEscape } from '@/lib/machine-layer'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database }

const rfc822 = (iso: string): string => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString()
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const db = await readyDb(getDb(env), 'feed.xml')
  const origin = new URL(req.url).origin

  const operator = await soleOperator(db)
  if (!operator) return new Response('Not found', { status: 404 })
  const rows = await loadPublicFeed(db, operator.id, 200)
  const name = operator.display_name || operator.handle || 'the log'

  const items = rows.map(r => {
    const marked = r.author === 'operator' ? '' : ' (written by the log)'
    const body = r.detail ? `${r.text}\n\n${r.detail}` : r.text
    return `    <item>
      <title>${xmlEscape(r.text)}</title>
      <link>${origin}/entry/${r.id}</link>
      <guid isPermaLink="true">${origin}/entry/${r.id}</guid>
      <pubDate>${rfc822(r.happened_at)}</pubDate>
      <description>${xmlEscape(body + marked)}</description>
    </item>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(name)}</title>
    <link>${origin}/public</link>
    <atom:link href="${origin}/feed.xml" rel="self" type="application/rss+xml" />
    <description>A record, in order. Every entry carries the date it happened and the date it was logged.</description>
    <language>en</language>
    <lastBuildDate>${rfc822(rows[0]?.logged_at || new Date().toISOString())}</lastBuildDate>
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
