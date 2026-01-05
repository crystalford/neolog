import crypto from 'crypto'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const hashKey = (key: string) => crypto.createHash('sha256').update(key).digest('hex')

export async function requireAutomationKey(request: NextRequest) {
  const raw =
    request.headers.get('x-api-key') ||
    request.headers.get('x-neolog-key') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''

  const key = raw.trim()
  if (!key) {
    return { ok: false as const, error: 'Missing API key.' }
  }

  const admin = createAdminClient()
  if (!admin) {
    return { ok: false as const, error: 'Server missing Supabase admin configuration.' }
  }

  const keyHash = hashKey(key)

  const { data: row, error } = await admin
    .from('api_keys')
    .select('id, user_id')
    .eq('key_hash', keyHash)
    .single()

  if (error || !row) {
    return { ok: false as const, error: 'Invalid API key.' }
  }

  await admin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)

  return { ok: true as const, userId: row.user_id as string, keyId: row.id as string }
}
