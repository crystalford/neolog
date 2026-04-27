import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'

export const runtime = 'edge'

/**
 * POST /api/system/reprocess-stuck
 * Fires a fresh process event for uploads stuck at saving-results, error, or uploaded
 * (excluding anything updated in the last 5 minutes — still in progress).
 */
export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()

    const { data: stuck, error } = await supabase
      .from('video_uploads')
      .select('id, user_id, file_name, status')
      .eq('user_id', user.id)
      .in('status', ['saving-results', 'error', 'uploaded'])
      .lt('updated_at', cutoff)
      .limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!stuck || stuck.length === 0) {
      return NextResponse.json({ reprocessed: 0, message: 'No stuck uploads found' })
    }

    await Promise.all(
      stuck.map(u =>
        inngest.send({
          name: 'video-upload/process',
          data: { video_upload_id: u.id, user_id: u.user_id, mode: 'full' },
        }).catch(e => console.error('Inngest send failed for', u.id, e))
      )
    )

    return NextResponse.json({
      reprocessed: stuck.length,
      ids: stuck.map(u => u.id),
    })
  } catch (e: any) {
    console.error('reprocess-stuck error:', e)
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
