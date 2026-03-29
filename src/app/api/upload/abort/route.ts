/**
 * DELETE /api/upload/abort
 *
 * Aborts an in-progress multipart upload. Call when user cancels a upload.
 * Body: { uploadId: string, key: string }
 */
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { abortMultipartUpload } from '@/lib/storage/r2'

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { uploadId, key } = body

  if (!uploadId || !key) {
    return NextResponse.json({ error: 'uploadId and key required' }, { status: 400 })
  }
  if (!key.startsWith(`${session.user.id}/`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    await abortMultipartUpload(key, uploadId)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[upload/abort]', err.message)
    return NextResponse.json({ error: 'Failed to abort upload' }, { status: 500 })
  }
}
