import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

type RedditComment = {
  body: string
  author: string
  score: number
  created_utc: number
  permalink: string
}

type XReply = {
  id: string
  text: string
  author_id: string
  author_username: string
  author_name?: string
  created_at: string | null
  like_count: number
}

const REDDIT_HOSTS = new Set(['reddit.com', 'www.reddit.com', 'old.reddit.com'])

const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'])

function isRedditUrl(url: string) {
  try {
    const parsed = new URL(url)
    return REDDIT_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}

function isXUrl(url: string) {
  try {
    const parsed = new URL(url)
    return X_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}

function extractXTweetId(url: string) {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname
    const match = path.match(/\/status\/(\d+)/)
    return match?.[1] || null
  } catch {
    return null
  }
}

function normalizeRedditJsonUrl(url: string) {
  if (url.endsWith('.json')) return url
  return url.replace(/\/$/, '') + '.json'
}

function extractRedditComments(payload: any): RedditComment[] {
  const listing = payload?.[1]?.data?.children || []
  const comments: RedditComment[] = []
  listing.forEach((child: any) => {
    if (child.kind !== 't1') return
    const data = child.data
    if (!data?.body) return
    comments.push({
      body: data.body,
      author: data.author || 'unknown',
      score: data.score || 0,
      created_utc: data.created_utc || 0,
      permalink: data.permalink || '',
    })
  })
  return comments
}

async function fetchXReplies(bearerToken: string, tweetId: string): Promise<XReply[]> {
  const baseHeaders = {
    accept: 'application/json',
    Authorization: `Bearer ${bearerToken}`,
  }

  // Confirm the tweet exists and get author
  const tweetResp = await fetch(`https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=author_id,created_at,public_metrics`, {
    headers: baseHeaders,
  })

  if (!tweetResp.ok) {
    throw new Error('Failed to fetch X tweet.')
  }

  const tweetJson = await tweetResp.json()
  const authorId = tweetJson?.data?.author_id

  const queryParts = [`conversation_id:${tweetId}`, 'is:reply', '-is:retweet']
  if (authorId) {
    queryParts.push(`-from:${authorId}`)
  }
  const query = queryParts.join(' ')

  const searchUrl = new URL('https://api.twitter.com/2/tweets/search/recent')
  searchUrl.searchParams.set('query', query)
  searchUrl.searchParams.set('max_results', '50')
  searchUrl.searchParams.set('tweet.fields', 'author_id,created_at,public_metrics,conversation_id')
  searchUrl.searchParams.set('expansions', 'author_id')
  searchUrl.searchParams.set('user.fields', 'username,name')

  const repliesResp = await fetch(searchUrl.toString(), { headers: baseHeaders })
  if (!repliesResp.ok) {
    throw new Error('Failed to search X replies.')
  }

  const repliesJson = await repliesResp.json()
  const users = new Map<string, any>()
  for (const user of repliesJson?.includes?.users || []) {
    if (user?.id) users.set(String(user.id), user)
  }

  const replies: XReply[] = []
  for (const item of repliesJson?.data || []) {
    if (!item?.id || !item?.text || !item?.author_id) continue
    const metrics = item.public_metrics || {}
    const user = users.get(String(item.author_id))
    replies.push({
      id: String(item.id),
      text: String(item.text),
      author_id: String(item.author_id),
      author_username: String(user?.username || 'unknown'),
      author_name: typeof user?.name === 'string' ? user.name : undefined,
      created_at: typeof item.created_at === 'string' ? item.created_at : null,
      like_count: Number(metrics.like_count || 0),
    })
  }

  return replies
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tryStartRun = async (meta: Record<string, any>) => {
    if (runId) return
    try {
      const run = await startJobRun('comments.import', meta)
      runId = run.id
    } catch {
      // best-effort
    }
  }

  const { postId, url } = await request.json()
  if (!postId || !url) {
    finalMeta = { user_id: session.user.id, post_id: postId || null }
    await tryStartRun(finalMeta)
    finalErrorMessage = 'postId and url are required'
    return NextResponse.json({ error: 'postId and url are required' }, { status: 400 })
  }

  finalMeta = {
    user_id: session.user.id,
    post_id: postId,
    url_host: (() => {
      try {
        return new URL(String(url)).hostname
      } catch {
        return null
      }
    })(),
    source: isRedditUrl(url) ? 'reddit' : isXUrl(url) ? 'x' : 'unknown',
  }
  await tryStartRun(finalMeta)

  const { data: post } = await supabase
    .from('posts')
    .select('id, author_id')
    .eq('id', postId)
    .eq('author_id', session.user.id)
    .single()

  if (!post) {
    finalErrorMessage = 'Post not found'
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  try {
    if (isRedditUrl(url)) {
      const response = await fetch(normalizeRedditJsonUrl(url), {
        headers: { 'User-Agent': 'neolog/1.0' },
      })
      if (!response.ok) {
        finalErrorMessage = 'Failed to fetch Reddit thread.'
        return NextResponse.json({ error: 'Failed to fetch Reddit thread.' }, { status: 400 })
      }

      const payload = await response.json()
      const comments = extractRedditComments(payload)
        .filter((comment) => comment.score >= 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)

      await supabase
        .from('curated_comments')
        .delete()
        .eq('post_id', postId)
        .eq('author_id', session.user.id)
        .eq('source', 'reddit')

      const rows = comments.map((comment) => ({
        post_id: postId,
        author_id: session.user.id,
        source: 'reddit',
        source_url: `https://www.reddit.com${comment.permalink}`,
        author_name: comment.author,
        author_url: `https://www.reddit.com/user/${comment.author}`,
        body: comment.body,
        score: comment.score,
        created_at: comment.created_utc ? new Date(comment.created_utc * 1000).toISOString() : null,
      }))

      if (rows.length > 0) {
        await supabase.from('curated_comments').insert(rows)
      }

      finalStatus = 'success'
      finalMeta = { ...finalMeta, imported: rows.length }
      return NextResponse.json({ imported: rows.length })
    }

    if (isXUrl(url)) {
      const tweetId = extractXTweetId(url)
      if (!tweetId) {
        finalErrorMessage = 'Could not extract tweet ID from URL.'
        return NextResponse.json({ error: 'Could not extract tweet ID from URL.' }, { status: 400 })
      }

      const xKey = await resolveProviderKeyWithClient(supabase, session.user.id, 'x')
      if (!xKey?.key) {
        finalErrorMessage = 'X API key not configured.'
        return NextResponse.json({
          error: 'X API key not configured. Add it in Settings -> AI Capture (BYOK) under "X (Twitter) API".',
        }, { status: 400 })
      }

      const replies = (await fetchXReplies(xKey.key, tweetId))
        .filter((reply) => reply.like_count >= 1)
        .sort((a, b) => b.like_count - a.like_count)
        .slice(0, 5)

      await supabase
        .from('curated_comments')
        .delete()
        .eq('post_id', postId)
        .eq('author_id', session.user.id)
        .eq('source', 'x')

      const rows = replies.map((reply) => ({
        post_id: postId,
        author_id: session.user.id,
        source: 'x',
        source_url: `https://x.com/${reply.author_username}/status/${reply.id}`,
        author_name: reply.author_username,
        author_url: `https://x.com/${reply.author_username}`,
        body: reply.text,
        score: reply.like_count,
        created_at: reply.created_at,
      }))

      if (rows.length > 0) {
        await supabase.from('curated_comments').insert(rows)
      }

      finalStatus = 'success'
      finalMeta = { ...finalMeta, imported: rows.length }
      return NextResponse.json({ imported: rows.length })
    }

    finalErrorMessage = 'Unsupported URL. Use a Reddit or X post URL.'
    return NextResponse.json({ error: 'Unsupported URL. Use a Reddit or X post URL.' }, { status: 400 })
  } catch (error) {
    console.error('Comment import error:', error)
    finalErrorMessage = 'Failed to import comments.'
    return NextResponse.json({ error: 'Failed to import comments.' }, { status: 500 })
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

