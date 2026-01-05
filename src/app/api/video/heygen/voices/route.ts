import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'

export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const key = await resolveProviderKeyWithClient(supabase, session.user.id, 'heygen')
  if (!key?.key) {
    return NextResponse.json({
      error: 'HeyGen API key not configured. Add it in Settings → AI Vault (BYOK).',
    }, { status: 400 })
  }

  const response = await fetch('https://api.heygen.com/v2/voices', {
    headers: {
      accept: 'application/json',
      'x-api-key': key.key,
    },
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to list HeyGen voices.', details: data }, { status: 502 })
  }

  return NextResponse.json(data)
}
