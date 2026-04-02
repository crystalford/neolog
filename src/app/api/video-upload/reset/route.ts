import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'

/**
 * POST /api/video-upload/reset
 * Resets a stuck or failed upload and re-triggers the processing pipeline.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing upload ID' }, { status: 400 })
    }

    // 1. Verify ownership and current status
    const { data: upload, error: fetchError } = await supabase
      .from('video_uploads')
      .select('*')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single()

    if (fetchError || !upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    // 2. Reset status to 'uploaded' and clear error
    const { error: updateError } = await supabase
      .from('video_uploads')
      .update({
        status: 'uploaded',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update status', details: updateError.message }, { status: 500 })
    }

    // 3. Re-trigger Inngest
    await inngest.send({
      name: 'video-upload/process',
      data: { video_upload_id: id, user_id: session.user.id },
    })

    console.log(`[API] Reset and re-triggered processing for upload ${id}`);

    return NextResponse.json({ success: true, id, status: 'uploaded' })
  } catch (error: any) {
    console.error('Reset upload error:', error)
    return NextResponse.json({ error: 'Reset failed', message: error.message }, { status: 500 })
  }
}
