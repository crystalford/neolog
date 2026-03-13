import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/transcript-words?upload_id=X
export async function GET(request: NextRequest) {
  const uploadId = request.nextUrl.searchParams.get('upload_id')
  if (!uploadId) {
    return NextResponse.json({ error: 'upload_id required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('transcript_words')
    .select('*')
    .eq('video_upload_id', uploadId)
    .eq('user_id', session.user.id)
    .order('word_index', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ words: data ?? [] })
}

// PATCH /api/transcript-words — toggle is_cut for a list of word IDs
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { wordIds, isCut } = body

  if (!Array.isArray(wordIds) || wordIds.length === 0) {
    return NextResponse.json({ error: 'wordIds must be a non-empty array' }, { status: 400 })
  }
  if (typeof isCut !== 'boolean') {
    return NextResponse.json({ error: 'isCut must be a boolean' }, { status: 400 })
  }

  const { error } = await supabase
    .from('transcript_words')
    .update({ is_cut: isCut })
    .eq('user_id', session.user.id)
    .in('id', wordIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
