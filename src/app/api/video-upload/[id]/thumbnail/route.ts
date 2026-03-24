import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// PATCH: Save a thumbnail captured client-side directly to DB
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { thumbnail_url } = body
  if (!thumbnail_url || typeof thumbnail_url !== 'string') {
    return NextResponse.json({ error: 'thumbnail_url required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('video_uploads')
    .update({ thumbnail_url, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', session.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
