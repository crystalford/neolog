export const runtime = 'edge'
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

    finalMeta = {
      username: username || null,
      wants_text: wantsText(request),
    }

    try {
      const run = await startJobRun('agent.user', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!username) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'username is required.' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: publication } = await supabase
      .from('publications')
      .select('id, name, slug, description, website_url, owner_id, is_active')
      .eq('slug', username)
      .maybeSingle()

    if (!publication || !publication.is_active) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'publication_not_found' }
      return NextResponse.json({ error: 'Publication not found.' }, { status: 404 })
    }

    const { data: posts } = await supabase
      .from('posts')
      .select('id, title, slug, excerpt, published_at, canonical_url')
      .eq('publication_id', publication.id)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(20)

    if (wantsText(request)) {
      const origin = new URL(request.url).origin
      const display = publication.name
      let md = `# ${display} (@${publication.slug})\n\n`
      if (publication.description) {
        md += `${publication.description}\n\n`
      }
      if (publication.website_url) {
        md += `Website: ${publication.website_url}\n\n`
      }
      md += `Profile: ${origin}/${publication.slug}\n\n`
      md += `## Recent posts\n\n`

      const list = posts || []
      if (list.length === 0) {
        md += `No published posts yet.\n`
      } else {
        for (const post of list) {
          const url = `${origin}/${publication.slug}/${post.slug}`
          const date = post.published_at ? new Date(post.published_at).toISOString().slice(0, 10) : ''
          const suffix = date ? ` - ${date}` : ''
          md += `- ${post.title} (${url})${suffix}\n`
        }
      }

      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'success', posts_count: (posts || []).length }
      return responseText(request, md)
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', posts_count: (posts || []).length }
    return NextResponse.json({
      profile: {
        username: publication.slug,
        display_name: publication.name,
        bio: publication.description,
        website_url: publication.website_url,
      },
      posts: posts || [],
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

