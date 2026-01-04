import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const username = searchParams.get('username')
  const slug = searchParams.get('slug')

  if (!username || !slug) {
    return NextResponse.json({ error: 'username and slug are required.' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio')
    .eq('username', username)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Author not found.' }, { status: 404 })
  }

  const { data: post } = await supabase
    .from('posts')
    .select('id, title, subtitle, slug, excerpt, content, content_html, published_at, canonical_url, original_source')
    .eq('author_id', profile.id)
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (!post) {
    return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
  }

  return NextResponse.json({
    post,
    author: {
      username: profile.username,
      display_name: profile.display_name,
      bio: profile.bio,
    },
  })
}
