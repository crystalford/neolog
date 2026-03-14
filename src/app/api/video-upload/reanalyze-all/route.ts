import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'

/**
 * POST /api/video-upload/reanalyze-all
 *
 * Triggers the reanalyze-all-uploads Inngest job for the current user.
 * Returns immediately — progress can be tracked in the Inngest dashboard.
 */
export async function POST(_req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Count how many uploads will be processed
    const { count } = await supabase
      .from('video_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('status', 'processed')
      .not('transcript', 'is', null)

    await inngest.send({
      name: 'neolog/reanalyze-all',
      data: { user_id: session.user.id },
    })

    return NextResponse.json({
      ok: true,
      queued: count || 0,
      message: `Queued ${count || 0} uploads for re-analysis`,
    })
  } catch (err: any) {
    console.error('Reanalyze-all trigger error:', err)
    return NextResponse.json({ error: err.message || 'Failed to trigger' }, { status: 500 })
  }
}
