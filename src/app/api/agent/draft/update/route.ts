import { NextRequest, NextResponse } from 'next/server'

import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  const finish = async (
    status: 'success' | 'error',
    meta: Record<string, any> = {},
    errorMessage?: string,
  ) => {
    try {
      if (!runId) return
      await finishJobRun(runId, status, { duration_ms: Date.now() - startedAt, ...meta }, errorMessage)
    } catch {
      // best-effort
    }
  }

  const auth = await requireAutomationKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const run = await startJobRun('agent.draft.update', { user_id: auth.userId })
    runId = run.id
  } catch {
    // best-effort
  }

  const admin = createAdminClient()
  if (!admin) {
    await finish('error', {}, 'Server misconfigured.')
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  const body = (await request.json().catch(() => null)) as
    | {
        postId?: string
        title?: string
        excerpt?: string
        content?: string
        content_html?: string
        content_type?: 'markdown' | 'html' | 'rich' | 'pulse'
      }
    | null

  if (!body?.postId) {
    await finish('error', {}, 'postId is required.')
    return NextResponse.json({ error: 'postId is required.' }, { status: 400 })
  }

  const patch: Record<string, any> = {}
  if (typeof body.title === 'string') patch.title = body.title
  if (typeof body.excerpt === 'string') patch.excerpt = body.excerpt
  if (typeof body.content === 'string') patch.content = body.content
  if (typeof body.content_html === 'string') patch.content_html = body.content_html
  if (typeof body.content_type === 'string') patch.content_type = body.content_type

  if (Object.keys(patch).length === 0) {
    await finish('error', { post_id: body.postId }, 'No fields to update.')
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 })
  }

  patch.updated_at = new Date().toISOString()

  const { data: post, error: postError } = await admin
    .from('posts')
    .select('id, author_id, status')
    .eq('id', body.postId)
    .single()

  if (postError || !post) {
    await finish('error', { post_id: body.postId }, 'Post not found.')
    return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
  }

  if (post.author_id !== auth.userId) {
    await finish('error', { post_id: post.id }, 'Forbidden.')
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  if (post.status !== 'draft') {
    await finish('error', { post_id: post.id }, 'Only draft posts can be updated.')
    return NextResponse.json({ error: 'Only draft posts can be updated.' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await admin
    .from('posts')
    .update(patch)
    .eq('id', body.postId)
    .select('id, slug, status, updated_at')
    .single()

  if (updateError || !updated) {
    await finish('error', { post_id: body.postId }, updateError?.message || 'Failed to update post.')
    return NextResponse.json({ error: 'Failed to update post.' }, { status: 500 })
  }

  await finish('success', { post_id: updated.id, updated_at: updated.updated_at })
  return NextResponse.json({ ok: true, post: updated })
}
