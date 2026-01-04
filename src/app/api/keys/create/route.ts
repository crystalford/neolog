import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

const hashKey = (key: string) =>
  crypto.createHash('sha256').update(key).digest('hex')

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const label = typeof body.label === 'string' ? body.label : null

  const rawKey = `neo_${crypto.randomBytes(24).toString('hex')}`
  const keyHash = hashKey(rawKey)

  const { error } = await supabase
    .from('api_keys')
    .insert({
      user_id: session.user.id,
      label,
      key_hash: keyHash,
    })

  if (error) {
    return NextResponse.json({ error: 'Failed to create key.' }, { status: 500 })
  }

  return NextResponse.json({ key: rawKey })
}
