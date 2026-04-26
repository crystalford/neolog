export const runtime = 'edge'

import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'

export async function POST() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Count face corpus
  const { count } = await supabase
    .from('neural_corpus')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.user.id)
    .eq('type', 'face')

  if (!count || count < 15) {
    return Response.json({ error: `Need at least 15 portrait photos (you have ${count ?? 0})` }, { status: 422 })
  }

  await inngest.send({
    name: 'manifest/lora-threshold-met',
    data: { user_id: session.user.id },
  })

  return Response.json({ queued: true })
}
