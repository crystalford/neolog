export const runtime = 'edge'

import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'

export async function POST() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ElevenLabs key is configured
  const { data: key } = await supabase
    .from('integration_keys')
    .select('key_value')
    .eq('user_id', session.user.id)
    .eq('provider', 'elevenlabs')
    .eq('is_active', true)
    .single()

  if (!key?.key_value) {
    return Response.json({ error: 'ElevenLabs API key not configured — add one in Settings → API' }, { status: 422 })
  }

  await inngest.send({
    name: 'manifest/voice-threshold-met',
    data: { user_id: session.user.id },
  })

  return Response.json({ queued: true })
}
