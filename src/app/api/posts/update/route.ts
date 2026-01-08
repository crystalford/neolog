import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKey } from '@/lib/ai-provider'
import { enforceUsageCaps } from '@/lib/usageCaps'
import { logProviderUsage } from '@/lib/usage'
import { embedTextWithOpenAI, pickTextForEmbedding, sha256, vectorLiteral } from '@/lib/embeddings'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export const dynamic = 'force-dynamic'

type Body = {
  postId?: string
  patch?: {
    title?: string
    subtitle?: string | null
    slug?: string
    content?: string | null
    content_html?: string | null
    content_type?: 'markdown' | 'html' | 'rich'
    cover_image_url?: string | null
    reading_time_minutes?: number
    excerpt?: string | null
    canonical_url?: string | null
    original_source?: string | null
    is_premium?: boolean
    scheduled_at?: string | null
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tryStartRun = async (meta: Record<string, any>) => {
      if (runId) return
      try {
        const run = await startJobRun('posts.update', meta)
        runId = run.id
      } catch {
        // best-effort
      }
    }

    const body = (await request.json().catch(() => null)) as Body | null
    const postId = body?.postId
    const patch = body?.patch

    if (!postId) {
      finalMeta = { user_id: session.user.id, post_id: null }
      await tryStartRun(finalMeta)
      finalErrorMessage = 'postId is required'
      return NextResponse.json({ error: 'postId is required' }, { status: 400 })
    }

    if (!patch || Object.keys(patch).length === 0) {
      finalMeta = { user_id: session.user.id, post_id: postId, patch_keys: [] }
      await tryStartRun(finalMeta)
      finalErrorMessage = 'patch is required'
      return NextResponse.json({ error: 'patch is required' }, { status: 400 })
    }

    finalMeta = {
      user_id: session.user.id,
      post_id: postId,
      patch_keys: Object.keys(patch).slice(0, 50),
    }
    await tryStartRun(finalMeta)

    // Load current post (ownership + status check)
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, author_id, status, title, excerpt, content, content_html, updated_at')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      finalErrorMessage = 'Post not found'
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    if (post.author_id !== session.user.id) {
      finalErrorMessage = 'Forbidden'
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Only intended for updating published posts.
    if (post.status !== 'published') {
      finalErrorMessage = 'Only published posts can be updated here.'
      return NextResponse.json({ error: 'Only published posts can be updated here.' }, { status: 400 })
    }

    const allowed: Record<string, any> = {}
    for (const key of [
      'title',
      'subtitle',
      'slug',
      'content',
      'content_html',
      'content_type',
      'cover_image_url',
      'reading_time_minutes',
      'excerpt',
      'canonical_url',
      'original_source',
      'is_premium',
    ] as const) {
      if (key in patch) {
        ;(allowed as any)[key] = (patch as any)[key]
      }
    }

    allowed.updated_at = new Date().toISOString()

    const { data: updated, error: updateError } = await supabase
      .from('posts')
      .update(allowed)
      .eq('id', postId)
      .select('id, slug, title, excerpt, content, content_html, updated_at')
      .single()

    if (updateError || !updated) {
      finalErrorMessage = updateError?.message || 'Failed to update post'
      return NextResponse.json({ error: updateError?.message || 'Failed to update post' }, { status: 500 })
    }

    // Create a version snapshot (best-effort)
    try {
      const { data: latestVersion } = await supabase
        .from('post_versions')
        .select('version_number')
        .eq('post_id', postId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextVersionNumber = (latestVersion?.version_number || 0) + 1

      await supabase.from('post_versions').insert({
        post_id: postId,
        version_number: nextVersionNumber,
        title: updated.title,
        content: updated.content,
        content_html: updated.content_html,
        change_summary: 'Updated',
        changed_by: session.user.id,
      })
    } catch {
      // ignore
    }

    // Refresh embedding if content changed (best-effort; never blocks)
    try {
      const openaiKey = await resolveProviderKey(session.user.id, 'openai')
      const admin = createAdminClient()

      if (openaiKey?.key && admin) {
        let canEmbed = true
        try {
          await enforceUsageCaps({ supabase, userId: session.user.id, provider: 'openai' })
        } catch {
          canEmbed = false
        }

        if (canEmbed) {
          const text = pickTextForEmbedding({
            title: updated.title,
            excerpt: updated.excerpt,
            content: updated.content,
            content_html: updated.content_html,
          })

          if (text) {
            const newHash = sha256(text)

            const { data: existingEmbedding } = await admin
              .from('post_embeddings')
              .select('content_hash')
              .eq('post_id', postId)
              .maybeSingle()

            const oldHash = existingEmbedding?.content_hash || null

            if (!oldHash || oldHash !== newHash) {
              const embedding = await embedTextWithOpenAI({
                apiKey: openaiKey.key,
                text,
                onUsage: (u) => {
                  void logProviderUsage({
                    userId: session.user.id,
                    provider: 'openai',
                    model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
                    route: '/api/posts/update',
                    operation: 'embeddings',
                    usage: { prompt_tokens: u.prompt_tokens, total_tokens: u.total_tokens },
                    metadata: { post_id: postId },
                  })
                },
              })

              await admin.from('post_embeddings').upsert(
                {
                  post_id: postId,
                  embedding: vectorLiteral(embedding),
                  content_hash: newHash,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'post_id' },
              )
            }
          }
        }
      }
    } catch {
      // ignore
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, post_id: updated.id, slug: updated.slug }
    return NextResponse.json({ ok: true, post: { id: updated.id, slug: updated.slug } })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Internal server error'
    return NextResponse.json({ error: finalErrorMessage }, { status: 500 })
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
