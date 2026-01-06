import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

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
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const { searchParams } = new URL(request.url)
    const username = searchParams.get('username')
    const slug = searchParams.get('slug')

    finalMeta = {
      username: username || null,
      slug_present: Boolean(slug),
      wants_text: wantsText(request),
    }

    try {
      const run = await startJobRun('agent.post', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!username || !slug) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'username and slug are required.' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, display_name, bio')
      .eq('username', username)
      .single()

    if (!profile) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'author_not_found' }
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
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'post_not_found' }
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
    }

    if (wantsText(request)) {
      const origin = new URL(request.url).origin
      let md = `# ${post.title}\n\n`
      if (post.subtitle) {
        md += `*${post.subtitle}*\n\n`
      }
      md += `by ${profile.display_name || profile.username} (@${profile.username})\n\n`
      if (post.published_at) {
        md += `Published: ${new Date(post.published_at).toISOString()}\n\n`
      }
      md += `Link: ${origin}/${profile.username}/${post.slug}\n\n`
      if (post.canonical_url) {
        md += `Canonical: ${post.canonical_url}\n\n`
      }
      if (post.original_source) {
        md += `Original source: ${post.original_source}\n\n`
      }
      if (post.excerpt) {
        md += `---\n\n${post.excerpt}\n\n`
      }

      // Prefer author-provided content; if it's HTML, include as a fenced block.
      if (post.content) {
        md += `---\n\n`
        md += `\n\n`
        md += '```html\n'
        md += post.content
        md += '\n```\n'
      } else if (post.content_html) {
        md += `---\n\n`
        md += '```html\n'
        md += post.content_html
        md += '\n```\n'
      }

      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'success', post_id: post.id }
      return responseText(request, md)
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', post_id: post.id }
    return NextResponse.json({
      post,
      author: {
        username: profile.username,
        display_name: profile.display_name,
        bio: profile.bio,
      },
    })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Internal server error'
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  } finally {
    try {
      if (runId) {
        await finishJobRun(
          runId,
          finalStatus,
          { duration_ms: Date.now() - startedAt, ...finalMeta },
          finalErrorMessage,
        )
      }
    } catch {
      // best-effort
    }
  }
}
