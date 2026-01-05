import { NextRequest, NextResponse } from 'next/server'

import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { createAdminClient } from '@/lib/supabase/admin'
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

  const provider = await resolveProviderKeyWithClient(admin, auth.userId, 'openai')
  if (!provider) {
    return NextResponse.json(
      { error: 'Missing OpenAI integration (or Pro managed key) for this user.' },
      { status: 402 },
    )
  }

  const url = new URL(request.url)
  const limitRaw = parseInt(url.searchParams.get('limit') || '200', 10)
  const maxUpsertsRaw = parseInt(url.searchParams.get('maxUpserts') || '25', 10)
  const username = (url.searchParams.get('username') || '').trim()

  const limit = Math.max(1, Math.min(1000, Number.isFinite(limitRaw) ? limitRaw : 200))
  const maxUpserts = Math.max(1, Math.min(100, Number.isFinite(maxUpsertsRaw) ? maxUpsertsRaw : 25))

  let authorId: string | null = null
  if (username) {
    const { data: profile, error } = await admin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Failed to resolve username.' }, { status: 500 })
    }

    if (!profile) {
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
    return NextResponse.json({ error: 'Failed to load posts.' }, { status: 500 })
  }

  const postIds = (posts || []).map((p) => p.id)
  if (postIds.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, upserted: 0 })
  }

  const { data: existingEmbeddings, error: embError } = await admin
    .from('post_embeddings')
    .select('post_id,content_hash')
    .in('post_id', postIds)

  if (embError) {
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
    const embedding = await embedTextWithOpenAI({ apiKey: provider.key, text: item.text })
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
      return NextResponse.json(
        { error: 'Failed to upsert embedding.', details: upsertError.message },
        { status: 500 },
      )
    }

    upserted += 1
  }

  return NextResponse.json({
    ok: true,
    scanned: posts?.length || 0,
    stale: toUpsert.length,
    upserted,
  })
}
