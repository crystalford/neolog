/**
 * GET /api/v2/footage/sheet — the hand-off: a sheet an editor can work from.
 *
 * SPEC §2, `footage.html`: "hand-off to an editor as **originals + a
 * sheet**." The originals are already in R2 and are not copied here; what an
 * editor needs on top of them is one row per clip saying what it is, how
 * long, when, what is in the frame, and whether the operator marked it
 * usable.
 *
 * CSV, because the receiving end is a spreadsheet or an NLE bin, not a
 * browser. The presigned links expire in seven days and the sheet says so in
 * its own header rather than handing over URLs that quietly stop working.
 *
 * The fence again: this exports what he marked. It does not choose, order by
 * suitability, or suggest a sequence.
 */

export const runtime = 'edge'

import { NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

/** One CSV field, quoted so a description with a comma in it survives. */
const cell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return new Response('Unauthenticated', { status: 401 })
    throw e
  }
  const db = await readyDb(getDb(env), 'footage-sheet')

  const only = req.nextUrl.searchParams.get('mark') === 'usable'
  const rows = await findMany<{
    id: string; title: string | null; original_filename: string | null
    r2_key: string | null; transcoded_r2_key: string | null
    duration_seconds: number | null; recorded_at: string | null; created_at: string
    vision_description: string | null; frame_note: string | null
    usable: number | null; usable_note: string | null
  }>(
    db,
    `SELECT v.id, v.title, v.original_filename, v.r2_key, v.transcoded_r2_key,
            v.duration_seconds, v.recorded_at, v.created_at,
            v.vision_description, v.frame_note, v.usable, v.usable_note
       FROM vlogs v
      WHERE v.operator_id = ? AND v.deleted_at IS NULL
        ${only ? 'AND v.usable = 1' : ''}
      ORDER BY COALESCE(v.recorded_at, v.created_at) ASC
      LIMIT 1000`,
    operator.id,
  )

  const lines: string[] = [
    '# Footage sheet. The links below expire seven days from the date in this header.',
    `# Made ${new Date().toISOString()} · ${rows.length} clips${only ? ' marked usable' : ''}.`,
    '# The originals are the source of truth; this sheet describes them.',
    [
      'id', 'file', 'recorded', 'seconds', 'usable', 'why',
      'in the frame (the log)', 'in the frame (you)', 'link',
    ].map(cell).join(','),
  ]

  for (const r of rows) {
    const key = r.transcoded_r2_key || r.r2_key
    let link = ''
    if (key) {
      try { link = await presignGetUrl(env, key, 7 * 24 * 3600) } catch { link = '' }
    }
    lines.push([
      r.id,
      r.original_filename || r.title || '',
      (r.recorded_at || r.created_at || '').slice(0, 10),
      r.duration_seconds ?? '',
      // His mark, in words. A blank means he has not said, which is not "no".
      r.usable === 1 ? 'yes' : r.usable === 0 ? 'no' : '',
      r.usable_note || '',
      r.vision_description || '',
      r.frame_note || '',
      link,
    ].map(cell).join(','))
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="footage-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
