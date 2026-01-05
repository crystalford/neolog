import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const postId = request.nextUrl.searchParams.get('postId')
  if (!postId) {
    return NextResponse.json({ error: 'postId is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('post_syndications')
    .select('provider,status,external_id,external_url,error_message,created_at,updated_at')
    .eq('post_id', postId)
    .eq('author_id', session.user.id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Failed to load syndications.' }, { status: 500 })
  }

  return NextResponse.json({ syndications: data || [] })
}
