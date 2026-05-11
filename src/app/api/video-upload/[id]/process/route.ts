// Manually trigger full processing for a vlog that was uploaded in archive
// mode (or for any other reason needs transcription + analysis run now).
//
// The locked pipeline (transcode + thumbnail + recorded_at) has already run
// at archive time. This endpoint kicks off the rest: audio extract, transcribe,
// and the analysis pass. After Phase 3 lands, this will also fan out the new
// three-pass extraction (threads / clip-candidates / creative-elements).

export const runtime = 'edge'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

  const { data: upload, error } = await admin
    .from('video_uploads')
    .select('id, user_id, status')
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .single()

  if (error || !upload) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
  }

  if (upload.status === 'processed') {
    return NextResponse.json({ ok: true, already_processed: true })
  }

  // Reset to 'uploaded' so the pipeline picks it up cleanly. The
  // process-upload function skips already-processed rows but otherwise
  // re-runs the full chain.
  await admin.from('video_uploads').update({
    status: 'uploaded',
    error_message: null,
    updated_at: new Date().toISOString(),
  }).eq('id', upload.id)

  try {
    await inngest.send({
      name: 'video-upload/process',
      data: { video_upload_id: upload.id, user_id: session.user.id, mode: 'full' },
    })
  } catch (err: any) {
    console.error('[process] Inngest send failed:', err.message)
    return NextResponse.json({ error: 'Failed to queue processing — check Inngest configuration' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
