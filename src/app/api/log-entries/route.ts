export const runtime = 'edge'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: entries, error } = await supabase
      .from('log_entries')
      .select('*')
      .eq('user_id', session.user.id)
      .order('logged_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ entries })
  } catch (error: any) {
    console.error('Fetch logs error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch logs' }, { status: 500 })
  }
}
