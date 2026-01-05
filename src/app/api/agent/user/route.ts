import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function wantsText(request: NextRequest) {
  const url = new URL(request.url)
  const format = url.searchParams.get('format')?.toLowerCase()
  if (format === 'md' || format === 'markdown' || format === 'text' || format === 'txt') {
    return true
  }
  const accept = request.headers.get('accept')?.toLowerCase() || ''
  return accept.includes('text/markdown') || accept.includes('text/plain')
}

function responseText(request: NextRequest, body: string) {
  const accept = request.headers.get('accept')?.toLowerCase() || ''
  const contentType = accept.includes('text/plain') && !accept.includes('text/markdown')
    ? 'text/plain; charset=utf-8'
    : 'text/markdown; charset=utf-8'

  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    },
  })
}

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

  if (wantsText(request)) {
    const origin = new URL(request.url).origin
    const display = profile.display_name || profile.username
    let md = `# ${display} (@${profile.username})\n\n`
    if (profile.bio) {
      md += `${profile.bio}\n\n`
    }
    if (profile.website_url) {
      md += `Website: ${profile.website_url}\n\n`
    }
    md += `Profile: ${origin}/${profile.username}\n\n`
    md += `## Recent posts\n\n`

    const list = posts || []
    if (list.length === 0) {
      md += `No published posts yet.\n`
    } else {
      for (const post of list) {
        const url = `${origin}/${profile.username}/${post.slug}`
        const date = post.published_at ? new Date(post.published_at).toISOString().slice(0, 10) : ''
        const suffix = date ? ` — ${date}` : ''
        md += `- ${post.title} (${url})${suffix}\n`
      }
    }

    return responseText(request, md)
  }

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
