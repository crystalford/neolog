import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const username = searchParams.get('username')

  if (!username) {
    return NextResponse.json({ error: 'username is required.' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, website_url')
    .eq('username', username)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  }

  const { data: posts } = await supabase
    .from('posts')
    .select('id, title, slug, excerpt, published_at, canonical_url')
    .eq('author_id', profile.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(20)

  return NextResponse.json({
    profile: {
      username: profile.username,
      display_name: profile.display_name,
      bio: profile.bio,
      website_url: profile.website_url,
    },
    posts: posts || [],
  })
}
