export const runtime = 'edge'

import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { production_id } = await req.json()
  if (!production_id) return Response.json({ error: 'production_id required' }, { status: 400 })

  // Verify ownership
  const { data: production, error: prodErr } = await supabase
    .from('productions')
    .select('id, status')
    .eq('id', production_id)
    .eq('user_id', session.user.id)
    .single()

  if (prodErr || !production) return Response.json({ error: 'Not found' }, { status: 404 })

  // Verify all segment_assets are recorded
  const { data: assets, error: assetsErr } = await supabase
    .from('segment_assets')
    .select('id, status, segment_order')
    .eq('production_id', production_id)
    .order('segment_order')

  if (assetsErr || !assets?.length) {
    return Response.json({ error: 'No segments found for this production' }, { status: 422 })
  }

  const pending = assets.filter(a => a.status !== 'recorded')
  if (pending.length > 0) {
    return Response.json({
      error: `${pending.length} segment(s) not yet recorded`,
      pending_segments: pending.map(a => a.segment_order),
    }, { status: 422 })
  }

  // Mark production as assembling
  await supabase.from('productions').update({
    status: 'assembling',
    updated_at: new Date().toISOString(),
  }).eq('id', production_id)

  // Fire assembly job
  await inngest.send({
    name: 'studio/assemble-audio',
    data: {
      production_id,
      user_id: session.user.id,
    },
  })

  return Response.json({ queued: true })
}
