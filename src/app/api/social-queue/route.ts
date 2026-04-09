import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

/**
 * GET /api/social-queue
 * Fetch the pending social posts queue.
 */
export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'

  // Since the table might not exist yet in the user's local Supabase, 
  // we'll safely handle errors or fall back to extracting from video_uploads.
  // Ideally, we'd have a social_queue table. 
  // For now, let's try to fetch from it.
  const { data, error } = await supabase
    .from('social_queue')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (error) {
    // FALLBACK: If table doesn't exist, we'll "mock" it from recent video analysis
    // for demonstration purposes until the migration is run.
    const { data: uploads } = await supabase
      .from('video_uploads')
      .select('id, analysis, file_name, created_at')
      .eq('user_id', session.user.id)
      .eq('status', 'processed')
      .order('created_at', { ascending: false })
      .limit(20)

    const posts: any[] = []
    uploads?.forEach(u => {
      const analysis = u.analysis as any
      if (analysis?.strong_opinions) {
        analysis.strong_opinions.forEach((op: string) => {
          posts.push({
            id: `temp-${u.id}-${op.slice(0, 10)}`,
            content: op,
            platform: 'x',
            status: 'pending',
            source_upload_id: u.id,
            source_name: u.file_name,
            created_at: u.created_at
          })
        })
      }
    })
    
    return NextResponse.json({ posts })
  }

  return NextResponse.json({ posts: data || [] })
}

/**
 * PATCH /api/social-queue
 * Update post status (approve, schedule, skip)
 */
export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, status, scheduled_at } = body

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { data, error } = await supabase
    .from('social_queue')
    .update({ 
      status, 
      scheduled_at, 
      updated_at: new Date().toISOString() 
    })
    .eq('id', id)
    .eq('user_id', session.user.id)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, post: data[0] })
}
