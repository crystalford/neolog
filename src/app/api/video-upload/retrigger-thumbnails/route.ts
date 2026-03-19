import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'

/**
 * POST /api/video-upload/retrigger-thumbnails
 *
 * Fires generate-thumbnail for every video upload that has a null, empty, or
 * SVG-placeholder thumbnail_url. Returns immediately — Inngest handles the work.
 */
export async function POST(_req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Fetch all video uploads with broken/missing thumbnails
    const { data: uploads, error } = await supabase
      .from('video_uploads')
      .select('id, thumbnail_url')
      .eq('user_id', session.user.id)
      .like('mime_type', 'video/%')

    if (error) throw error

    const broken = (uploads || []).filter(u =>
      !u.thumbnail_url || u.thumbnail_url.startsWith('data:image/svg+xml')
    )

    if (broken.length === 0) {
      return NextResponse.json({ ok: true, queued: 0, message: 'No broken thumbnails found' })
    }

    // Fire one generate-thumbnail event per broken upload
    await inngest.send(
      broken.map(u => ({
        name: 'video-upload/generate-thumbnail' as const,
        data: { video_upload_id: u.id, user_id: session.user.id },
      }))
    )

    return NextResponse.json({
      ok: true,
      queued: broken.length,
      message: `Queued ${broken.length} thumbnail${broken.length === 1 ? '' : 's'} for regeneration`,
    })
  } catch (err: any) {
    console.error('Retrigger-thumbnails error:', err)
    return NextResponse.json({ error: err.message || 'Failed to trigger' }, { status: 500 })
  }
}
