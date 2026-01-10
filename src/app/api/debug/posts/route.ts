import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()

  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Get all posts for this user
  const { data: posts, error } = await supabase
    .from('posts')
    .select('id, title, status, published_at, created_at, author_id, publication_id, content_type')
    .eq('author_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get user's publications
  const { data: publications } = await supabase
    .from('publications')
    .select('id, name')
    .eq('owner_id', session.user.id)

  return NextResponse.json({
    posts,
    publications,
    userId: session.user.id,
    counts: {
      total: posts?.length || 0,
      published: posts?.filter(p => p.status === 'published').length || 0,
      draft: posts?.filter(p => p.status === 'draft').length || 0,
      scheduled: posts?.filter(p => p.status === 'scheduled').length || 0,
      with_publication_id: posts?.filter(p => p.publication_id).length || 0,
      without_publication_id: posts?.filter(p => !p.publication_id).length || 0,
    }
  })
}
