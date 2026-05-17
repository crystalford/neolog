/**
 * /api/v2/settings — operator key/value preferences.
 *
 *   GET  → returns { settings: { key: value, ... } } for the current operator
 *   POST → body { key, value }     upsert one setting
 *
 * Whitelist of known keys lives in src/lib/operator-settings.ts. Unknown keys
 * are rejected so a typo in the client doesn't silently write garbage.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
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
    const settings = await getAllSettings(getDb(env), operator.id)
    return NextResponse.json({ settings })
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
