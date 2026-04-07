import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'

export const runtime = 'edge'

/**
 * POST /api/video-upload/reset
 * Resets a stuck or failed upload and re-triggers the processing pipeline.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    // Use getSession (reads cookies) — getUser makes a network call that can fail in edge runtimes
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('[Reset] Auth session error:', sessionError.message)
      return NextResponse.json({ error: 'Auth error', details: sessionError.message }, { status: 401 })
    }

    if (!session) {
      console.error('[Reset] No session found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    let body: any
    try {
      body = await request.json()
    } catch (e) {
      console.error('[Reset] Failed to parse request body:', e)
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { id, mode = 'full' } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing upload ID' }, { status: 400 })
    }

    console.log(`[Reset] User ${userId} requesting ${mode} reset for upload ${id}`)

    // 1. Verify ownership
    const { data: upload, error: fetchError } = await supabase
      .from('video_uploads')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (fetchError) {
      console.error('[Reset] Fetch error:', fetchError.message)
      return NextResponse.json({ error: 'Upload not found', details: fetchError.message }, { status: 404 })
    }
    if (!upload) {
      console.error('[Reset] Upload not found or not owned by user')
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    console.log(`[Reset] Found upload ${id} with status: ${upload.status}`)

    // 2. Reset status to give immediate UI feedback
    const { error: updateError } = await supabase
      .from('video_uploads')
      .update({
        status: 'uploaded',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      console.error('[Reset] Update error:', updateError.message)
      return NextResponse.json({ error: 'Failed to update status', details: updateError.message }, { status: 500 })
    }

    console.log(`[Reset] Status reset to starting. Sending Inngest event...`)

    // 3. Re-trigger Inngest
    await inngest.send({
      name: 'video-upload/process',
      data: { video_upload_id: id, user_id: userId, mode },
    })

    console.log(`[Reset] Successfully triggered pipeline for ${id} (mode: ${mode})`)

    return NextResponse.json({ success: true, id, status: 'starting' })
  } catch (error: any) {
    console.error('[Reset] Unhandled error:', error?.message, error?.stack)
    return NextResponse.json({ error: 'Reset failed', message: error?.message ?? 'unknown error' }, { status: 500 })
  }
}
