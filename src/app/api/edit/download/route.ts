export const runtime = 'edge'

import { createClient } from '@/lib/supabase/server'
import { presignDownloadUrl } from '@/lib/storage/r2'

export async function GET(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('productions')
    .select('final_video_r2_keys')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .single()

  if (error || !data) return Response.json({ error: 'Not found' }, { status: 404 })

  const key = (data.final_video_r2_keys as string[])?.[0]
  if (!key) return Response.json({ error: 'No video available yet' }, { status: 404 })

  const url = await presignDownloadUrl(key, 3600)
  return Response.json({ url })
}
