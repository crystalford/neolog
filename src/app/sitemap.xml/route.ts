/**
 * GET /sitemap.xml — every public address.
 *
 * Only what a stranger can actually reach: the public log, the machine
 * layer, and one URL per PUBLIC entry. The operator's own surfaces — the
 * composer, triage, settings, the archive — are not listed, because they
 * are not public and a sitemap is a promise about what is.
 *
 * `lastmod` is the entry's `logged_at`, not `happened_at`: it is when the
 * page changed, which is a different question from when the thing happened,
 * and the two-times model means we have both without guessing.
 */

export const runtime = 'edge'

import { NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { loadPublicFeed, soleOperator, xmlEscape } from '@/lib/machine-layer'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database }

const day = (iso: string): string => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const db = await readyDb(getDb(env), 'sitemap')
  const origin = new URL(req.url).origin

  const operator = await soleOperator(db)
  if (!operator) return new Response('Not found', { status: 404 })

  const [entries, pages] = await Promise.all([
    loadPublicFeed(db, operator.id, 500),
    findMany<{ id: string; updated_at: string | null; created_at: string }>(
      db,
      `SELECT id, updated_at, created_at FROM pages
        WHERE operator_id = ? AND deleted_at IS NULL AND merged_into IS NULL
          AND entry_count > 0
        ORDER BY COALESCE(updated_at, created_at) DESC
        LIMIT 500`,
      operator.id,
    ),
  ])

  const fixed = ['/public', '/facts', '/everything', '/glossary', '/asks', '/numbers', '/pages']
  const urls = [
    ...fixed.map(p => ({ loc: `${origin}${p}`, mod: null as string | null })),
    ...entries.map(e => ({ loc: `${origin}/entry/${e.id}`, mod: e.logged_at })),
    ...pages.map(p => ({ loc: `${origin}/page/${p.id}`, mod: p.updated_at || p.created_at })),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${xmlEscape(u.loc)}</loc>${u.mod ? `
    <lastmod>${day(u.mod)}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  })
}
