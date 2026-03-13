import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'

export async function POST() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify minimum uploads before queuing
  const { count } = await supabase
    .from('video_uploads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', session.user.id)
    .eq('status', 'processed')

  if (!count || count < 3) {
    return NextResponse.json(
      { error: `Need at least 3 processed uploads (you have ${count ?? 0})` },
      { status: 422 },
    )
  }

  await inngest.send({
    name: 'neolog/synthesize-graph',
    data: { user_id: session.user.id },
  })

  return NextResponse.json({ queued: true })
}
