import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  // Verify ownership
  const { data: upload, error: fetchError } = await admin
    .from('video_uploads')
    .select('storage_path, user_id')
    .eq('id', params.id)
    .single()

  if (fetchError || !upload) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (upload.user_id !== session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (!upload.storage_path) {
    return NextResponse.json({ error: 'No storage path' }, { status: 404 })
  }

  const { data: signed, error: signError } = await admin.storage
    .from('videos')
    .createSignedUrl(upload.storage_path, 3600)

  if (signError || !signed?.signedUrl) {
    console.error('[signed-url] Failed to generate signed URL:', signError)
    return NextResponse.json({ error: signError?.message ?? 'Failed to generate URL' }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: signed.signedUrl })
}
