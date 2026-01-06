import { NextRequest, NextResponse } from 'next/server'

import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { embedTextWithOpenAI, pickTextForEmbedding, sha256, vectorLiteral } from '@/lib/embeddings'
import { logProviderUsage } from '@/lib/usage'
import { enforceUsageCaps } from '@/lib/usageCaps'
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
    const run = await startJobRun('agent.draft.publish', { user_id: auth.userId })
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
      }
    | null

  if (!body?.postId) {
    await finish('error', {}, 'postId is required.')
    return NextResponse.json({ error: 'postId is required.' }, { status: 400 })
  }

  const { data: post } = await admin
    .from('posts')
    .select('id, author_id, status, title, excerpt, content, content_html')
    .eq('id', body.postId)
    .single()

  if (!post) {
    await finish('error', { post_id: body.postId }, 'Post not found.')
    return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
  }

  if (post.author_id !== auth.userId) {
    await finish('error', { post_id: post.id }, 'Forbidden.')
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const now = new Date().toISOString()

  const { data: updated, error } = await admin
    .from('posts')
    .update({ status: 'published', published_at: now, updated_at: now })
    .eq('id', body.postId)
    .select('id, slug, status, published_at')
    .single()

  if (error || !updated) {
    await finish('error', { post_id: body.postId }, error?.message || 'Failed to publish post.')
    return NextResponse.json({ error: 'Failed to publish post.' }, { status: 500 })
  }

  // Best-effort embedding
  try {
    const provider = await resolveProviderKeyWithClient(admin as any, auth.userId, 'openai')
    if (provider?.key) {
      let canEmbed = true
      try {
        await enforceUsageCaps({ supabase: admin, userId: auth.userId, provider: 'openai' })
      } catch {
        canEmbed = false
      }

      if (canEmbed) {
        const text = pickTextForEmbedding({
          title: post.title,
          excerpt: post.excerpt,
          content: post.content,
          content_html: post.content_html,
        })
        if (text) {
          const embedding = await embedTextWithOpenAI({
            apiKey: provider.key,
            text,
            onUsage: (u) => {
              void logProviderUsage({
                userId: auth.userId,
                provider: 'openai',
                model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
                route: '/api/agent/draft/publish',
                operation: 'embeddings',
                usage: { prompt_tokens: u.prompt_tokens, total_tokens: u.total_tokens },
                metadata: { post_id: post.id },
              })
            },
          })
          await admin
            .from('post_embeddings')
            .upsert(
              {
                post_id: post.id,
                embedding: vectorLiteral(embedding),
                content_hash: sha256(text),
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'post_id' },
            )

        }
      }
    }
  } catch {
    // ignore
  }

  await finish('success', { post_id: updated.id, published_at: updated.published_at })
  return NextResponse.json({ ok: true, post: updated })
}
