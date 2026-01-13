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
    const q = (searchParams.get('q') || '').trim()
    const username = (searchParams.get('username') || '').trim()
    const limitRaw = searchParams.get('limit')

    const limit = Math.min(Math.max(parseInt(limitRaw || '10', 10) || 10, 1), 25)

    finalMeta = {
      q_len: q.length,
      username: username || null,
      limit,
      wants_text: wantsText(request),
    }

    try {
      const run = await startJobRun('agent.search', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!q) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'q is required.' }, { status: 400 })
    }

    const supabase = createClient()

    let authorId: string | null = null
    let authorUsername: string | null = null

    if (username) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', username)
        .maybeSingle()

      if (!profile) {
        finalStatus = 'success'
        finalMeta = { ...finalMeta, result: 'user_not_found' }
        return NextResponse.json({ error: 'User not found.' }, { status: 404 })
      }

      authorId = profile.id
      authorUsername = profile.username
    }

    // Simple search: title/excerpt match. (Vector search can be added later.)
    let query = supabase
      .from('posts')
      .select('id, title, slug, excerpt, published_at, author:profiles(username, display_name)')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit)

    if (authorId) {
      query = query.eq('author_id', authorId)
    }

    // Use `or()` to match either title or excerpt.
    query = query.or(`title.ilike.%${q}%,excerpt.ilike.%${q}%`)

    const { data: posts, error } = await query

    if (error) {
      finalErrorMessage = 'Search failed'
      return NextResponse.json({ error: 'Search failed.' }, { status: 500 })
    }

    const origin = new URL(request.url).origin

    if (wantsText(request)) {
      let md = authorUsername
        ? `# Search results for "${q}" by @${authorUsername}\n\n`
        : `# Search results for "${q}"\n\n`

      const list = posts || []
      if (list.length === 0) {
        md += `No results.\n`
        finalStatus = 'success'
        finalMeta = { ...finalMeta, result: 'success', results_count: 0 }
        return responseText(request, md)
      }

      for (const post of list as any[]) {
        const author = Array.isArray(post.author) ? post.author[0] : post.author
        const u = author?.username
        const url = u ? `${origin}/${u}/${post.slug}` : `${origin}/`
        const date = post.published_at ? new Date(post.published_at).toISOString().slice(0, 10) : ''
        const by = author?.display_name || author?.username ? ` - ${author?.display_name || author?.username}` : ''
        const suffix = date ? ` (${date})` : ''
        md += `- ${post.title}${by}${suffix}\n  ${url}\n`
        if (post.excerpt) {
          md += `  ${String(post.excerpt).replace(/\s+/g, ' ').trim()}\n`
        }
      }

      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'success', results_count: (posts || []).length }
      return responseText(request, md)
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', results_count: (posts || []).length }
    return NextResponse.json({
      query: q,
      username: authorUsername,
      results: posts || [],
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

