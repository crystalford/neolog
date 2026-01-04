import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('integration_keys')
    .select('provider, label')
    .eq('user_id', session.user.id)

  if (error) {
    return NextResponse.json({ error: 'Failed to load integrations.' }, { status: 500 })
  }

  return NextResponse.json({ keys: data || [] })
}
