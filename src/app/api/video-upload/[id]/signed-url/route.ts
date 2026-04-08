export const runtime = 'edge'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { presignDownloadUrl } from '@/lib/storage/r2'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership using user-auth client (RLS handles it)
  const { data: upload, error: fetchError } = await supabase
    .from('video_uploads')
    .select('storage_path, playback_path, storage_provider')
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .single()

  if (fetchError || !upload) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const key = upload.playback_path || upload.storage_path
  if (!key) return NextResponse.json({ error: 'No storage path' }, { status: 404 })

  try {
    let signedUrl: string | null = null
    if (upload.storage_provider === 'r2') {
      signedUrl = await presignDownloadUrl(key, 3600)
    } else {
      const { data: signed } = await supabase.storage.from('videos').createSignedUrl(key, 3600)
      signedUrl = signed?.signedUrl || null
    }
    return NextResponse.json({ signedUrl, hasPlayback: !!upload.playback_path })
  } catch (err: any) {
    console.error('[signed-url] R2 presign failed:', err.message)
    return NextResponse.json({ error: 'Failed to generate URL' }, { status: 500 })
  }
}
