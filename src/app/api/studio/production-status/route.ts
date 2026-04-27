export const runtime = 'edge'

import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return new Response('id required', { status: 400 })

  const { data, error } = await supabase
    .from('productions')
    .select('id, status, error_message, final_video_r2_keys, script_id, scripts(title, script_json)')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .single()

  if (error || !data) return new Response('Not found', { status: 404 })

  return Response.json(data)
}
