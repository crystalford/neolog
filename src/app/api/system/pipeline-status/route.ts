import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'edge'

const IN_PROGRESS_STATUSES = [
  'starting', 'extracting-audio', 'extracting-metadata', 'metadata-extracted',
  'generating-thumbnail', 'transcoding-video', 'transcribed-media',
  'transcribing', 'analyzing', 'saving-results',
]

const QUEUED_STATUSES = ['uploaded']
const DONE_STATUSES = ['processed']
const FAILED_STATUSES = ['error']

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('video_uploads')
      .select('status, recorded_at, thumbnail_url')
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ counts: {}, total: 0 })

    const counts: Record<string, number> = {}
    let nullDates = 0
    let missingThumbnails = 0

    for (const row of data) {
      counts[row.status] = (counts[row.status] || 0) + 1
      if (!row.recorded_at) nullDates++
      if (!row.thumbnail_url || (row.thumbnail_url as string).startsWith('data:image/svg')) missingThumbnails++
    }

    const total = data.length
    const done = DONE_STATUSES.reduce((s, k) => s + (counts[k] || 0), 0)
    const inProgress = IN_PROGRESS_STATUSES.reduce((s, k) => s + (counts[k] || 0), 0)
    const queued = QUEUED_STATUSES.reduce((s, k) => s + (counts[k] || 0), 0)
    const failed = FAILED_STATUSES.reduce((s, k) => s + (counts[k] || 0), 0)

    // Estimate: 2 concurrent, ~7 min avg per video
    const remainingWork = queued + inProgress
    const estimatedMinutes = Math.ceil((queued / 2) * 7 + (inProgress * 3.5))

    return NextResponse.json({
      counts,
      total,
      done,
      inProgress,
      queued,
      failed,
      nullDates,
      missingThumbnails,
      estimatedMinutes: remainingWork > 0 ? estimatedMinutes : 0,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
