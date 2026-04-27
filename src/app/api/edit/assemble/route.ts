export const runtime = 'edge'

import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { topic, segments } = await req.json()
  if (!segments?.length) return Response.json({ error: 'segments required' }, { status: 400 })

  // Create a production record to track the assembly job
  const { data: production, error } = await supabase
    .from('productions')
    .insert({
      user_id: session.user.id,
      session_id: segments[0].upload_id, // loose reference to first source
      status: 'queued',
      target_platforms: ['youtube'],
      target_aspect_ratios: ['16:9'],
    })
    .select('id')
    .single()

  if (error || !production) {
    return Response.json({ error: error?.message ?? 'Failed to create production' }, { status: 500 })
  }

  await inngest.send({
    name: 'studio/auto-edit',
    data: {
      production_id: production.id,
      user_id: session.user.id,
      topic: topic ?? '',
      segments,
    },
  })

  return Response.json({ production_id: production.id })
}
