/**
 * GET   /api/v2/footage — the record as material, findable by what is in
 *                         the frame.
 * PATCH /api/v2/footage — his marks on one clip: usable or not, and what is
 *                         actually in it.
 *
 * `footage.html` / SPEC §2: "every clip findable by what's in the frame (the
 * `vision_*` descriptions as a second index, operator-correctable),
 * usable/not marks, used-where, a project heading as a bin, hand-off to an
 * editor as originals + a sheet. **Fence drawn: the log never chooses or
 * assembles b-roll.**"
 *
 * ── The second index ─────────────────────────────────────────────────────
 *
 * A recording is already findable by what he SAID — the transcript. This is
 * the other half: what was in front of the camera. The descriptions already
 * exist (`src/lib/vision.ts` writes them from the thumbnail); nothing new is
 * generated here. The search reads both indexes and says which one matched,
 * because "found because you said it" and "found because it was in shot" are
 * different facts and a filmmaker needs to know which.
 *
 * ── The fence ────────────────────────────────────────────────────────────
 *
 * This endpoint finds and marks. It does not rank by suitability, propose a
 * shot list, or assemble anything. Ordering is by date, always — a relevance
 * score would be the log having an opinion about which of his footage is
 * good, which is the thing the fence exists to prevent.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, run } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { visionTagVlogBacklog, type VisionEnv } from '@/lib/vision'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  // The frame descriptions are written by a model, so the binding is here.
  AI: { run: (m: unknown, a: unknown) => Promise<unknown> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

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
  const db = await readyDb(getDb(env), 'footage')

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || '').trim()
  const mark = sp.get('mark')          // 'usable' | 'no' | 'unmarked'
  const silent = sp.get('silent') === '1'
  const like = `%${q.toLowerCase()}%`

  const where: string[] = [
    'v.operator_id = ?', 'v.deleted_at IS NULL',
  ]
  const binds: unknown[] = [operator.id]

  if (q) {
    // Both indexes, and the row says afterwards which one hit.
    where.push(`(
      lower(COALESCE(v.vision_description, '')) LIKE ?
      OR lower(COALESCE(v.vision_tags, '')) LIKE ?
      OR lower(COALESCE(v.frame_note, '')) LIKE ?
      OR lower(COALESCE(v.transcript_text, '')) LIKE ?
      OR lower(COALESCE(v.original_filename, '')) LIKE ?
    )`)
    binds.push(like, like, like, like, like)
  }
  if (mark === 'usable') where.push('v.usable = 1')
  else if (mark === 'no') where.push('v.usable = 0')
  else if (mark === 'unmarked') where.push('v.usable IS NULL')
  // A clip with no speech is the one a filmmaker wants and the log's own
  // pages cannot show, because there is nothing to quote from it.
  if (silent) where.push(`(v.transcript_text IS NULL OR length(trim(v.transcript_text)) < 40)`)

  const rows = await findMany<{
    id: string; title: string | null; original_filename: string | null
    thumbnail_r2_key: string | null; thumbnail_url: string | null
    duration_seconds: number | null; recorded_at: string | null; created_at: string
    vision_description: string | null; vision_tags: string | null
    frame_note: string | null; transcript_text: string | null
    usable: number | null; usable_note: string | null
    used_in: number
  }>(
    db,
    `SELECT v.id, v.original_filename, v.thumbnail_r2_key, v.thumbnail_url,
            v.duration_seconds, v.recorded_at, v.created_at,
            v.vision_description, v.vision_tags, v.frame_note,
            substr(COALESCE(v.transcript_text, ''), 1, 400) AS transcript_text,
            v.usable, v.usable_note,
            -- Where this recording has been used. It used to count
            -- productions built from its threads; both tables went with the
            -- essay engine. What "used" means now is that the log has read
            -- words out of it, and that is a real answer rather than a
            -- placeholder: an entry citing this recording is the only thing
            -- in the product that uses one.
            (SELECT COUNT(*) FROM log_entries le
              WHERE le.operator_id = v.operator_id AND le.vlog_id = v.id
                AND le.deleted_at IS NULL AND le.buried_at IS NULL) AS used_in
       FROM vlogs v
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(v.recorded_at, v.created_at) DESC
      LIMIT 120`,
    ...binds,
  )

  // Only the rows that survive the filter are signed.
  const clips = await Promise.all(rows.map(async r => {
    let poster: string | null = r.thumbnail_url || null
    if (r.thumbnail_r2_key) {
      try { poster = await presignGetUrl(env, r.thumbnail_r2_key, 24 * 3600) } catch { /* keep the fallback */ }
    }
    const hay = (s: string | null) => (s || '').toLowerCase()
    return {
      id: r.id,
      original_filename: r.original_filename,
      poster,
      duration_seconds: r.duration_seconds,
      recorded_at: r.recorded_at || r.created_at,
      // What the log saw, and his correction of it, kept apart.
      in_frame: r.vision_description,
      frame_note: r.frame_note,
      tags: (() => { try { return JSON.parse(r.vision_tags || '[]') } catch { return [] } })(),
      has_speech: !!(r.transcript_text && r.transcript_text.trim().length >= 40),
      usable: r.usable,
      usable_note: r.usable_note,
      used_in: r.used_in,
      // Which index found it. Not decoration: "found because you said it"
      // and "found because it was in shot" are different facts.
      matched: q
        ? [
            (hay(r.vision_description).includes(q.toLowerCase())
              || hay(r.vision_tags).includes(q.toLowerCase())
              || hay(r.frame_note).includes(q.toLowerCase())) ? 'in the frame' : null,
            hay(r.transcript_text).includes(q.toLowerCase()) ? 'in what you said' : null,
          ].filter(Boolean)
        : [],
    }
  }))

  // ── Drain the frame-description backlog ────────────────────────────────
  //
  // ⚠️ `src/lib/vision.ts` had NO CALLER. Both its functions were written,
  // tested against the schema, and imported by nothing — so `vision_status`
  // stayed `'pending'` on every recording and `vision_description` stayed
  // null, which means **this page's second index had no data at all**. The
  // route's own header says the descriptions "exist"; three other files and
  // CLAUDE.md said the same. None of them was a caller.
  //
  // This is where it belongs, and the library's own comment says so: "called
  // from … a page-visit waitUntil, so the backlog drains on its own without
  // the operator doing anything." A bounded batch per visit, after the
  // response has gone, on the one page that needs what it writes.
  //
  // It describes what is in the FRAME and nothing else — the same reporting
  // call the hold-back check uses. It does not rank, score, or say whether a
  // clip is any good.
  const ctx = getRequestContext()
  ctx.ctx.waitUntil(
    visionTagVlogBacklog(env as unknown as VisionEnv, operator.id, 8)
      .catch(err => console.warn('[footage] frame descriptions:', err?.message || err)),
  )

  return NextResponse.json({ clips, query: q }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await operatorOr401(req, env)
  if (error) return error
  const db = await readyDb(getDb(env), 'footage')

  const body = await req.json().catch(() => ({})) as {
    id?: string; usable?: boolean | null; usable_note?: string; frame_note?: string
  }
  if (!body.id) return NextResponse.json({ error: 'which clip?' }, { status: 400 })

  const sets: string[] = []
  const binds: unknown[] = []
  if ('usable' in body) {
    // null is a real answer here — "he has not said" is not the same as "no".
    sets.push('usable = ?')
    binds.push(body.usable === null || body.usable === undefined ? null : (body.usable ? 1 : 0))
  }
  if (typeof body.usable_note === 'string') {
    sets.push('usable_note = ?')
    binds.push(body.usable_note.trim() || null)
  }
  if (typeof body.frame_note === 'string') {
    // His correction goes in its own column. The log's original description
    // stays where it is — both versions kept, as everywhere else.
    sets.push('frame_note = ?')
    binds.push(body.frame_note.trim() || null)
  }
  if (!sets.length) return NextResponse.json({ error: 'nothing to change' }, { status: 400 })
  sets.push('updated_at = CURRENT_TIMESTAMP')
  binds.push(body.id, operator!.id)

  await run(db, `UPDATE vlogs SET ${sets.join(', ')} WHERE id = ? AND operator_id = ?`, ...binds)
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
