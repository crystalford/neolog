import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'

export const runtime = 'edge'

/**
 * POST /api/system/fix-thumbnails
 * Fires mode:'thumbnail' process events for uploads with missing thumbnails.
 * Only targets videos (not audio/text) since thumbnails require a video source.
 */
export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Two passes: null thumbnails + svg placeholder thumbnails
    const [nullResult, svgResult] = await Promise.all([
      supabase.from('video_uploads').select('id, user_id').eq('user_id', user.id).eq('status', 'processed').is('thumbnail_url', null).limit(100),
      supabase.from('video_uploads').select('id, user_id').eq('user_id', user.id).eq('status', 'processed').like('thumbnail_url', 'data:image/svg%').limit(100),
    ])
    const error = nullResult.error || svgResult.error
    const seen = new Set<string>()
    const missing = [...(nullResult.data || []), ...(svgResult.data || [])].filter(r => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!missing || missing.length === 0) {
      return NextResponse.json({ queued: 0, message: 'No missing thumbnails found' })
    }

    await Promise.all(
      missing.map(u =>
        inngest.send({
          name: 'video-upload/process',
          data: { video_upload_id: u.id, user_id: u.user_id, mode: 'thumbnail' },
        }).catch(e => console.error('Inngest send failed for', u.id, e))
      )
    )

    return NextResponse.json({ queued: missing.length })
  } catch (e: any) {
    console.error('fix-thumbnails error:', e)
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
