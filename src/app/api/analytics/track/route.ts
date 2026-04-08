export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://app.posthog.com'

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const body = await request.json().catch(() => ({}))
    const postId = typeof body.postId === 'string' ? body.postId : ''
    const event = typeof body.event === 'string' ? body.event : ''
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    const properties = typeof body.properties === 'object' && body.properties ? body.properties : {}

    finalMeta = {
      post_id: postId || null,
      event: event || null,
      has_session_id: Boolean(sessionId),
      properties_keys: typeof properties === 'object' ? Object.keys(properties).length : 0,
    }

    try {
      const run = await startJobRun('analytics.track', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!postId || !event) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'postId and event are required.' }, { status: 400 })
    }

    const supabase = createAdminClient()
    if (!supabase) {
      finalErrorMessage = 'Missing Supabase service role key.'
      return NextResponse.json({ error: 'Missing Supabase service role key.' }, { status: 500 })
    }

    const { data: post } = await supabase
      .from('posts')
      .select('id, author_id, slug, title')
      .eq('id', postId)
      .maybeSingle()

    if (!post) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'post_not_found' }
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
    }

    const keyResult = await resolveProviderKeyWithClient(supabase as any, post.author_id, 'posthog')
    if (!keyResult?.key) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'skipped', author_id: post.author_id }
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
      finalErrorMessage = 'Failed to send analytics.'
      return NextResponse.json({ error: 'Failed to send analytics.' }, { status: 502 })
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', author_id: post.author_id }
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Analytics track error:', error)
    finalErrorMessage = error?.message || 'Internal server error'
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
