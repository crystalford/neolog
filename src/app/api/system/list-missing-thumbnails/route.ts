import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { presignDownloadUrl } from '@/lib/storage/r2'

export const runtime = 'edge'

/**
 * GET /api/system/list-missing-thumbnails
 * Returns uploads missing a thumbnail along with a signed URL the browser can
 * load to extract a frame. Browser-side thumbnail capture replaces the old
 * Replicate-based pipeline entirely.
 *
 * Prefers playback_path (H.264 transcode) over storage_path so HEVC files
 * decode in browsers that can't play them natively.
 */
export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [nullResult, svgResult] = await Promise.all([
      supabase
        .from('video_uploads')
        .select('id, storage_path, playback_path, mime_type')
        .eq('user_id', user.id)
        .is('thumbnail_url', null)
        .limit(100),
      supabase
        .from('video_uploads')
        .select('id, storage_path, playback_path, mime_type')
        .eq('user_id', user.id)
        .like('thumbnail_url', 'data:image/svg%')
        .limit(100),
    ])

    const error = nullResult.error || svgResult.error
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const seen = new Set<string>()
    const rows = [...(nullResult.data || []), ...(svgResult.data || [])].filter(r => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })

    const items = await Promise.all(
      rows
        .filter(r => (r.mime_type || '').startsWith('video/'))
        .map(async r => {
          const key = (r as any).playback_path || r.storage_path
          if (!key) return null
          const url = await presignDownloadUrl(key, 1800).catch(() => null)
          if (!url) return null
          return { id: r.id, url, mime_type: r.mime_type }
        })
    )

    return NextResponse.json({ items: items.filter(Boolean) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
