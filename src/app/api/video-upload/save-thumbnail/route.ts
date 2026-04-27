import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'edge'

const MAX_DATA_URL_BYTES = 400_000

/**
 * POST /api/video-upload/save-thumbnail
 * Body: { video_upload_id, data_url }
 * Persists a data: URL thumbnail captured client-side. Validates ownership
 * and shape so a client can't write arbitrary content into thumbnail_url.
 */
export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null) as { video_upload_id?: string; data_url?: string } | null
    const id = body?.video_upload_id
    const dataUrl = body?.data_url

    if (!id || !dataUrl) return NextResponse.json({ error: 'Missing video_upload_id or data_url' }, { status: 400 })
    if (!dataUrl.startsWith('data:image/jpeg;base64,') && !dataUrl.startsWith('data:image/png;base64,') && !dataUrl.startsWith('data:image/webp;base64,')) {
      return NextResponse.json({ error: 'Invalid data URL' }, { status: 400 })
    }
    if (dataUrl.length > MAX_DATA_URL_BYTES) {
      return NextResponse.json({ error: 'Thumbnail too large' }, { status: 413 })
    }

    const { data: row, error: fetchErr } = await supabase
      .from('video_uploads')
      .select('id, user_id')
      .eq('id', id)
      .single()
    if (fetchErr || !row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (row.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error: updateErr } = await supabase
      .from('video_uploads')
      .update({ thumbnail_url: dataUrl })
      .eq('id', id)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
