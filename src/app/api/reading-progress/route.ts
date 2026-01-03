import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, postId, progress, timeSpent } = body

    if (!userId || !postId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createClient()
    
    await supabase.rpc('update_reading_progress', {
      p_user_id: userId,
      p_post_id: postId,
      p_progress: progress || 0,
      p_time_spent: timeSpent || 0,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reading progress error:', error)
    return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
  }
}
