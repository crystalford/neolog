import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'

// GET /api/clip-sessions — list user's sessions
export async function GET() {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('clip_sessions')
      .select('id, title, status, clip_count, total_duration_seconds, processed_at, created_at, updated_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })

    return NextResponse.json({ sessions: data })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }
}

// POST /api/clip-sessions — create a new session
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { title } = body

    const { data: record, error } = await supabase
      .from('clip_sessions')
      .insert({
        user_id: session.user.id,
        title: title || null,
        status: 'collecting',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })

    return NextResponse.json({ session: record })
  } catch {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}
