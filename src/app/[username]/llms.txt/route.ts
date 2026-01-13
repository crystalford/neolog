import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const stripHtml = (input: string) =>
  input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export async function GET(
  _request: NextRequest,
  { params }: { params: { username: string } }
) {
  const supabase = createClient()
  const username = params.username

  const { data: publication } = await supabase
    .from('publications')
    .select('id, name, slug, description, is_active')
    .eq('slug', username)
    .maybeSingle()

  if (!publication || !publication.is_active) {
    return new NextResponse('Not found', { status: 404 })
  }

  const { data: posts } = await supabase
    .from('posts')
    .select('title, slug, excerpt, content_html, published_at')
    .eq('publication_id', publication.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(20)

  const lines = [
    `# ${publication.name}`,
    publication.description ? `\n${publication.description}` : '',
    '\n## Latest posts',
  ]

  ;(posts || []).forEach((post) => {
    const summary = post.excerpt || stripHtml(post.content_html || '').slice(0, 240)
    lines.push(
      `- ${post.title} - /${publication.slug}/${post.slug}`,
      summary ? `  - ${summary}` : ''
    )
  })

  const body = lines.filter((line) => line !== '').join('\n')

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}

