import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RedditComment = {
  body: string
  author: string
  score: number
  created_utc: number
  permalink: string
}

const REDDIT_HOSTS = new Set(['reddit.com', 'www.reddit.com', 'old.reddit.com'])

function isRedditUrl(url: string) {
  try {
    const parsed = new URL(url)
    return REDDIT_HOSTS.has(parsed.hostname)
  } catch {
    return false
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

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { postId, url } = await request.json()
  if (!postId || !url) {
    return NextResponse.json({ error: 'postId and url are required' }, { status: 400 })
  }

  const { data: post } = await supabase
    .from('posts')
    .select('id, author_id')
    .eq('id', postId)
    .eq('author_id', session.user.id)
    .single()

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  if (!isRedditUrl(url)) {
    return NextResponse.json({ error: 'Only Reddit URLs are supported right now.' }, { status: 400 })
  }

  try {
    const response = await fetch(normalizeRedditJsonUrl(url), {
      headers: { 'User-Agent': 'neolog/1.0' },
    })
    if (!response.ok) {
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

    return NextResponse.json({ imported: rows.length })
  } catch (error) {
    console.error('Comment import error:', error)
    return NextResponse.json({ error: 'Failed to import comments.' }, { status: 500 })
  }
}
