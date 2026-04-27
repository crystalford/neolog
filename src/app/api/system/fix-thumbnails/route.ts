import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'

export const runtime = 'edge'

/**
 * POST /api/system/fix-thumbnails
 * Fires mode:'thumbnail' process events for uploads with missing thumbnails.
 *
 * Targets two groups:
 * 1. status='processed' with null or SVG placeholder thumbnail
 * 2. status='generating-thumbnail' older than 30 minutes (stuck pipeline)
 */
export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    const [nullResult, svgResult, stuckResult] = await Promise.all([
      // Processed uploads with no thumbnail
      supabase.from('video_uploads').select('id, user_id').eq('user_id', user.id).eq('status', 'processed').is('thumbnail_url', null).limit(100),
      // Processed uploads with SVG placeholder thumbnail
      supabase.from('video_uploads').select('id, user_id').eq('user_id', user.id).eq('status', 'processed').like('thumbnail_url', 'data:image/svg%').limit(100),
      // Uploads stuck at generating-thumbnail for >30 min (pipeline crashed mid-step)
      supabase.from('video_uploads').select('id, user_id').eq('user_id', user.id).eq('status', 'generating-thumbnail').lt('updated_at', thirtyMinAgo).limit(50),
    ])

    const error = nullResult.error || svgResult.error || stuckResult.error
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const seen = new Set<string>()
    const missing = [
      ...(nullResult.data || []),
      ...(svgResult.data || []),
      ...(stuckResult.data || []),
    ].filter(r => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })

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

    return NextResponse.json({
      queued: missing.length,
      stuck_included: stuckResult.data?.length ?? 0,
    })
  } catch (e: any) {
    console.error('fix-thumbnails error:', e)
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
