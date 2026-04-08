export const runtime = 'edge'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'

type Params = { params: { id: string } }

// GET /api/clip-sessions/[id] — session detail + clips + synthesis
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: clipSession, error } = await supabase
      .from('clip_sessions')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', session.user.id)
      .single()

    if (error || !clipSession) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: clips } = await supabase
      .from('video_uploads')
      .select('id, file_name, file_size_bytes, mime_type, duration_seconds, status, tags, transcript, transcript_segments, analysis, generated_clips, processed_at, created_at')
      .eq('session_id', params.id)
      .order('created_at', { ascending: true })

    return NextResponse.json({ session: clipSession, clips: clips || [] })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 })
  }
}

// PATCH /api/clip-sessions/[id] — update title or trigger synthesis/assembly
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { action, title, edit_plan_id } = body

    if (action === 'synthesize') {
      // Trigger cross-clip synthesis via Inngest
      await inngest.send({
        name: 'clip-session/synthesize',
        data: { session_id: params.id, user_id: session.user.id },
      })

      await supabase
        .from('clip_sessions')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', params.id)
        .eq('user_id', session.user.id)

      return NextResponse.json({ status: 'processing' })
    }

    if (action === 'assemble' && edit_plan_id) {
      // Trigger video assembly for a specific edit plan via Inngest
      await inngest.send({
        name: 'clip-session/assemble',
        data: { session_id: params.id, edit_plan_id, user_id: session.user.id },
      })

      return NextResponse.json({ status: 'assembling' })
    }

    // Plain update (e.g. rename)
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (title !== undefined) updates.title = title

    const { data, error } = await supabase
      .from('clip_sessions')
      .update(updates)
      .eq('id', params.id)
      .eq('user_id', session.user.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

    return NextResponse.json({ session: data })
  } catch {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

// DELETE /api/clip-sessions/[id] — delete session (unlinks uploads, keeps them)
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Unlink uploads first (set session_id = null via cascade is set to null in migration)
    const { error } = await supabase
      .from('clip_sessions')
      .delete()
      .eq('id', params.id)
      .eq('user_id', session.user.id)

    if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
