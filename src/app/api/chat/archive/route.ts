import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messages } = await request.json()

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 })
    }

    // Trigger Inngest for async analysis
    await inngest.send({
      name: 'chat/session.ended',
      data: {
        user_id: session.user.id,
        messages,
        ended_at: new Date().toISOString(),
      },
    })

    return NextResponse.json({ success: true, message: 'Session archived and analysis queued.' })
  } catch (error: any) {
    console.error('Archive trigger error:', error)
    return NextResponse.json({ error: error.message || 'Failed to archive session' }, { status: 500 })
  }
}
