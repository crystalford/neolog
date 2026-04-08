export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'

import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { createAdminClient } from '@/lib/supabase/admin'
import { embedTextWithOpenAI, pickTextForEmbedding, sha256, vectorLiteral } from '@/lib/embeddings'
import { logProviderUsage } from '@/lib/usage'
import { enforceUsageCaps } from '@/lib/usageCaps'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireAutomationKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

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

  const admin = createAdminClient()
  if (!admin) {
    await finish('error', {}, 'Server misconfigured.')
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  try {
    const url = new URL(request.url)
    const limitRaw = parseInt(url.searchParams.get('limit') || '200', 10)
    const maxUpsertsRaw = parseInt(url.searchParams.get('maxUpserts') || '25', 10)
    const username = (url.searchParams.get('username') || '').trim()

    const limit = Math.max(1, Math.min(1000, Number.isFinite(limitRaw) ? limitRaw : 200))
    const maxUpserts = Math.max(1, Math.min(100, Number.isFinite(maxUpsertsRaw) ? maxUpsertsRaw : 25))

    try {
      const run = await startJobRun('agent.embeddings.backfill', {
        user_id: auth.userId,
        limit,
        maxUpserts,
        username: username || null,
      })
      runId = run.id
    } catch {
      // best-effort
    }

    const provider = await resolveProviderKeyWithClient(admin, auth.userId, 'openai')
    if (!provider) {
      await finish(
        'error',
        { limit, maxUpserts, username: username || null },
        'Missing OpenAI integration (or Pro managed key) for this user.',
      )
      return NextResponse.json(
        { error: 'Missing OpenAI integration (or Pro managed key) for this user.' },
        { status: 402 },
      )
    }

    try {
      await enforceUsageCaps({ supabase: admin, userId: auth.userId, provider: 'openai' })
    } catch (e: any) {
      await finish('error', { limit, maxUpserts }, e?.message || 'Usage cap reached.')
      return NextResponse.json({ error: e?.message || 'Usage cap reached.' }, { status: 429 })
    }

    let authorId: string | null = null
    if (username) {
      const { data: profile, error } = await admin
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle()

      if (error) {
        await finish('error', { username }, 'Failed to resolve username.')
        return NextResponse.json({ error: 'Failed to resolve username.' }, { status: 500 })
      }

      if (!profile) {
        await finish('error', { username }, 'User not found.')
        return NextResponse.json({ error: 'User not found.' }, { status: 404 })
      }

      authorId = profile.id
    }

    let postsQuery = admin
      .from('posts')
      .select('id,title,excerpt,content,content_html,updated_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit)

    if (authorId) postsQuery = postsQuery.eq('author_id', authorId)

    const { data: posts, error: postsError } = await postsQuery
    if (postsError) {
      await finish('error', { limit }, 'Failed to load posts.')
      return NextResponse.json({ error: 'Failed to load posts.' }, { status: 500 })
    }

    const postIds = (posts || []).map((p) => p.id)
    if (postIds.length === 0) {
      await finish('success', { scanned: 0, upserted: 0, stale: 0 })
      return NextResponse.json({ ok: true, scanned: 0, upserted: 0 })
    }

    const { data: existingEmbeddings, error: embError } = await admin
      .from('post_embeddings')
      .select('post_id,content_hash')
      .in('post_id', postIds)

    if (embError) {
      await finish('error', { scanned: posts?.length || 0 }, 'Failed to load embeddings.')
      return NextResponse.json({ error: 'Failed to load embeddings.' }, { status: 500 })
    }

    const hashByPostId = new Map<string, string>()
    for (const row of existingEmbeddings || []) {
      hashByPostId.set(row.post_id, row.content_hash)
    }

    const toUpsert: Array<{ post_id: string; text: string; hash: string }> = []
    for (const post of posts || []) {
      const text = pickTextForEmbedding(post)
      if (!text) continue

      const hash = sha256(text)
      const existingHash = hashByPostId.get(post.id)

      if (!existingHash || existingHash !== hash) {
        toUpsert.push({ post_id: post.id, text, hash })
      }
    }

    let upserted = 0
    for (const item of toUpsert.slice(0, maxUpserts)) {
      const embedding = await embedTextWithOpenAI({
        apiKey: provider.key,
        text: item.text,
        onUsage: (u) => {
          void logProviderUsage({
            userId: auth.userId,
            provider: 'openai',
            model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
            route: '/api/agent/embeddings/backfill',
            operation: 'embeddings',
            usage: { prompt_tokens: u.prompt_tokens, total_tokens: u.total_tokens },
            metadata: { post_id: item.post_id },
          })
        },
      })
      const { error: upsertError } = await admin
        .from('post_embeddings')
        .upsert(
          {
            post_id: item.post_id,
            embedding: vectorLiteral(embedding),
            content_hash: item.hash,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'post_id' },
        )

      if (upsertError) {
        await finish('error', { upserted, stale: toUpsert.length }, upsertError.message)
        return NextResponse.json(
          { error: 'Failed to upsert embedding.', details: upsertError.message },
          { status: 500 },
        )
      }

      upserted += 1
    }

    await finish('success', {
      scanned: posts?.length || 0,
      stale: toUpsert.length,
      upserted,
      limit,
      maxUpserts,
      username: username || null,
    })

    return NextResponse.json({
      ok: true,
      scanned: posts?.length || 0,
      stale: toUpsert.length,
      upserted,
    })
  } catch (e: any) {
    await finish('error', {}, e?.message || 'Unknown error')
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
