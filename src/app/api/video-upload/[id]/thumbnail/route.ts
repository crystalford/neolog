import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params

  // Verify ownership
  const { data: upload, error } = await supabase
    .from('video_uploads')
    .select('id, mime_type')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .single()

  if (error || !upload) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
  }

  await inngest.send({
    name: 'video-upload/generate-thumbnail',
    data: { video_upload_id: id, user_id: session.user.id },
  })

  return NextResponse.json({ status: 'queued' })
}
