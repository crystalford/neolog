export const runtime = 'edge'

import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { upload_id, style_card, selected_idea } = await req.json()
  if (!upload_id) return new Response('upload_id required', { status: 400 })

  // Create a placeholder script row (the Inngest function will fill it in)
  const { data: script, error: scriptErr } = await supabase
    .from('scripts')
    .insert({
      session_id: upload_id,
      user_id: session.user.id,
      title: 'Generating…',
      script_json: [],
      script_mode: 'essay',
      status: 'draft',
    })
    .select('id')
    .single()

  if (scriptErr || !script) {
    return new Response('Failed to create script: ' + scriptErr?.message, { status: 500 })
  }

  // Create the production row
  const { data: production, error: prodErr } = await supabase
    .from('productions')
    .insert({
      script_id: script.id,
      session_id: upload_id,
      user_id: session.user.id,
      status: 'queued',
      target_platforms: ['youtube', 'tiktok'],
      target_aspect_ratios: ['16:9', '9:16'],
      style_card_id: style_card?.id ?? null,
    })
    .select('id')
    .single()

  if (prodErr || !production) {
    return new Response('Failed to create production: ' + prodErr?.message, { status: 500 })
  }

  // Fire Inngest event
  await inngest.send({
    name: 'studio/produce',
    data: {
      production_id: production.id,
      script_id: script.id,
      upload_id,
      user_id: session.user.id,
      style_card: style_card ?? null,
      selected_idea: selected_idea ?? null,
    },
  })

  return Response.json({ production_id: production.id, script_id: script.id })
}
