import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'

const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://app.posthog.com'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const postId = typeof body.postId === 'string' ? body.postId : ''
    const event = typeof body.event === 'string' ? body.event : ''
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    const properties = typeof body.properties === 'object' && body.properties ? body.properties : {}

    if (!postId || !event) {
      return NextResponse.json({ error: 'postId and event are required.' }, { status: 400 })
    }

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Missing Supabase service role key.' }, { status: 500 })
    }

    const { data: post } = await supabase
      .from('posts')
      .select('id, author_id, slug, title')
      .eq('id', postId)
      .maybeSingle()

    if (!post) {
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
    }

    const keyResult = await resolveProviderKeyWithClient(supabase as any, post.author_id, 'posthog')
    if (!keyResult?.key) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const payload = {
      api_key: keyResult.key,
      event,
      distinct_id: sessionId || `anon-${postId}`,
      properties: {
        post_id: post.id,
        post_slug: post.slug,
        post_title: post.title,
        author_id: post.author_id,
        ...properties,
      },
    }

    const response = await fetch(`${POSTHOG_HOST}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to send analytics.' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Analytics track error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
