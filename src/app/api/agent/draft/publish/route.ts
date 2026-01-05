import { NextRequest, NextResponse } from 'next/server'

import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { embedTextWithOpenAI, pickTextForEmbedding, sha256, vectorLiteral } from '@/lib/embeddings'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireAutomationKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  const body = (await request.json().catch(() => null)) as
    | {
        postId?: string
      }
    | null

  if (!body?.postId) {
    return NextResponse.json({ error: 'postId is required.' }, { status: 400 })
  }

  const { data: post } = await admin
    .from('posts')
    .select('id, author_id, status, title, excerpt, content, content_html')
    .eq('id', body.postId)
    .single()

  if (!post) {
    return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
  }

  if (post.author_id !== auth.userId) {
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
    return NextResponse.json({ error: 'Failed to publish post.' }, { status: 500 })
  }

  // Best-effort embedding
  try {
    const provider = await resolveProviderKeyWithClient(admin as any, auth.userId, 'openai')
    if (provider?.key) {
      const text = pickTextForEmbedding({
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        content_html: post.content_html,
      })
      if (text) {
        const embedding = await embedTextWithOpenAI({ apiKey: provider.key, text })
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
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, post: updated })
}
