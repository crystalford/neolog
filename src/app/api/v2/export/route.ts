/**
 * GET /api/v2/export — a stretch of the log, as a document.
 *
 *   ?from=YYYY-MM-DD  &to=YYYY-MM-DD   the range (both optional)
 *   ?page_id=<id>                      restrict to one page
 *   ?entry_id=<id>                     a record of origin for one position
 *   ?format=md | json                  the document, or the manifest
 *
 * "Export is the promise" (SPEC §1). Markdown opens in anything; the JSON
 * manifest carries every field the document drops, so nothing is lost by
 * reading the pretty version. Media stays in R2 and the manifest points at
 * it with 24-hour URLs.
 *
 * Both responses are served as attachments so the browser saves a file
 * rather than rendering it — the point is to end up with something on disk
 * that outlives the software.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { buildExport, renderMarkdown } from '@/lib/export'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

/** A filename that says what is inside it, and sorts. */
function filenameFor(title: string, from: string | null, to: string | null, ext: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'log'
  const range = [from, to].filter(Boolean).join('_to_')
  const stamp = new Date().toISOString().slice(0, 10)
  return `neolog_${slug}${range ? `_${range}` : ''}_${stamp}.${ext}`
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = await readyDb(getDb(env), 'export')
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const pageId = url.searchParams.get('page_id')
  const entryId = url.searchParams.get('entry_id')
  const format = url.searchParams.get('format') === 'json' ? 'json' : 'md'

  const bundle = await buildExport(
    env, db, operator.id,
    (operator as any).name || (operator as any).email || 'the operator',
    { from, to, pageId, entryId },
  )

  if (format === 'json') {
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameFor(bundle.title, from, to, 'json')}"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  return new NextResponse(renderMarkdown(bundle), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameFor(bundle.title, from, to, 'md')}"`,
      'Cache-Control': 'no-store',
    },
  })
}
