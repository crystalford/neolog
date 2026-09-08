/**
 * /api/v2/settings
 *
 *   GET   → { settings: {...}, bio } — the key/value preferences plus the
 *           one sentence he has written about himself.
 *   POST  → { key, value } upsert one setting.
 *   PATCH → { bio } — his sentence, which `/facts` shows as his and will
 *           never write itself.
 *
 * Whitelist of known keys lives in src/lib/operator-settings.ts. Unknown keys
 * are rejected so a typo in the client doesn't silently write garbage.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { getAllSettings, setSetting, SETTING_KEYS, type SettingKey } from '@/lib/operator-settings'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

const KNOWN_KEYS = new Set<string>(Object.values(SETTING_KEYS))

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  try {
    const db = await readyDb(getDb(env), 'settings')
    const [settings, who] = await Promise.all([
      getAllSettings(db, operator.id),
      findOne<{ bio: string | null }>(db, `SELECT bio FROM operator WHERE id = ?`, operator.id),
    ])
    return NextResponse.json({ settings, bio: who?.bio ?? null })
  } catch (err: any) {
    // operator_settings table might not exist yet on live D1 if migrations
    // haven't fully run. Return empty settings + a hint instead of 500 so
    // the rest of the UI still works.
    const msg = err?.message || String(err)
    if (/no such table.*operator_settings/i.test(msg)) {
      return NextResponse.json({
        settings: {},
        warning: 'operator_settings table missing — POST /api/v2/admin/run-migrations to install.',
      })
    }
    return NextResponse.json({ error: 'settings GET failed', details: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const body = await req.json().catch(() => null) as { key?: string; value?: string } | null
  if (!body?.key || typeof body.key !== 'string') {
    return NextResponse.json({ error: 'key required' }, { status: 400 })
  }
  if (!KNOWN_KEYS.has(body.key)) {
    return NextResponse.json(
      { error: `Unknown setting key '${body.key}'. Known: ${Array.from(KNOWN_KEYS).join(', ')}` },
      { status: 400 },
    )
  }
  if (typeof body.value !== 'string') {
    return NextResponse.json({ error: 'value must be a string' }, { status: 400 })
  }
  await setSetting(getDb(env), operator.id, body.key as SettingKey, body.value)
  return NextResponse.json({ ok: true })
}

/** His one sentence. Typed by him or absent — the log does not draft it. */
export async function PATCH(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const body = await req.json().catch(() => ({})) as { bio?: string }
  if (typeof body.bio !== 'string') {
    return NextResponse.json({ error: 'bio must be a string' }, { status: 400 })
  }
  const db = await readyDb(getDb(env), 'settings')
  await run(
    db,
    `UPDATE operator SET bio = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    body.bio.trim().slice(0, 2000) || null, operator.id,
  )
  return NextResponse.json({ ok: true })
}
