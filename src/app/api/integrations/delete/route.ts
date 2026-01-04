import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('integration_keys')
    .select('id, provider')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Integration not found.' }, { status: 404 })
  }

  const { error } = await supabase
    .from('integration_keys')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete integration.' }, { status: 500 })
  }

  const { data: remaining } = await supabase
    .from('integration_keys')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('provider', existing.provider)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (remaining?.id) {
    await supabase
      .from('integration_keys')
      .update({ is_active: true })
      .eq('id', remaining.id)
  }

  return NextResponse.json({ ok: true })
}
