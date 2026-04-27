import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'

export const runtime = 'edge'

/**
 * POST /api/system/backfill-dates
 * Fires a one-shot Inngest job that re-extracts recorded_at for all uploads
 * where recorded_at IS NULL (for the authenticated user).
 */
export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await inngest.send({
      name: 'system/backfill-recorded-at',
      data: { user_id: user.id },
    })

    return NextResponse.json({ queued: true })
  } catch (e: any) {
    console.error('backfill-dates error:', e)
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
