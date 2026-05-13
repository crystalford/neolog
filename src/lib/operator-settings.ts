/**
 * Operator settings — key/value preferences in D1, readable from both server
 * routes (extraction, chat endpoint) and the client Settings UI.
 *
 * Keys are flat strings; values are TEXT (you can JSON.stringify objects).
 * Reads return null when not set so callers can fall back to a sensible
 * default in code rather than insisting the operator pick everything up-front.
 */

import type { D1Database } from '@cloudflare/workers-types'
import { findOne, run } from './d1'

export const SETTING_KEYS = {
  CHAT_DEFAULT_MODEL: 'chat_default_model',                  // 'scout' | 'kimi' | 'claude'
  EXTRACTION_WORKERS_MODEL: 'extraction_workers_model',      // '@cf/...' model id
  EXTRACTION_DEFAULT_TIER: 'extraction_default_tier',        // 'free' | 'premium' | 'max'
} as const

export type SettingKey = typeof SETTING_KEYS[keyof typeof SETTING_KEYS]

export async function getSetting(
  db: D1Database,
  operatorId: string,
  key: SettingKey,
): Promise<string | null> {
  const row = await findOne<{ value: string | null }>(
    db,
    'SELECT value FROM operator_settings WHERE operator_id = ? AND key = ?',
    operatorId, key,
  )
  return row?.value ?? null
}

export async function getAllSettings(
  db: D1Database,
  operatorId: string,
): Promise<Record<string, string>> {
  const rows: any = await db
    .prepare('SELECT key, value FROM operator_settings WHERE operator_id = ?')
    .bind(operatorId)
    .all()
  const out: Record<string, string> = {}
  for (const r of rows.results ?? []) {
    if (r.value != null) out[r.key] = r.value
  }
  return out
}

export async function setSetting(
  db: D1Database,
  operatorId: string,
  key: SettingKey,
  value: string,
): Promise<void> {
  await run(
    db,
    `INSERT INTO operator_settings (operator_id, key, value, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(operator_id, key) DO UPDATE SET
       value = excluded.value,
       updated_at = CURRENT_TIMESTAMP`,
    operatorId, key, value,
  )
}
