export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'

import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { embedTextWithOpenAI, sha256, vectorLiteral, EMBEDDING_DIM } from '@/lib/embeddings'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { logProviderUsage } from '@/lib/usage'
import { enforceUsageCaps } from '@/lib/usageCaps'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export const dynamic = 'force-dynamic'

type Actor = {
  userId: string
  openaiKey: string
}

type AssetType = 'prompt' | 'image' | 'code' | 'text' | 'link' | 'quote' | 'fragment'

const ALLOWED_TYPES: AssetType[] = ['prompt', 'image', 'code', 'text', 'link', 'quote', 'fragment']

async function resolveActor(req: NextRequest, admin: any): Promise<Actor | null> {
  const auth = await requireAutomationKey(req)
  if (auth.ok) {
    const provider = await resolveProviderKeyWithClient(admin, auth.userId, 'openai')
    if (!provider) return null
    return { userId: auth.userId, openaiKey: provider.key }
  }

  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const provider = await resolveProviderKeyWithClient(admin, user.id, 'openai')
  if (!provider) return null
  return { userId: user.id, openaiKey: provider.key }
}

function pickTextForAssetEmbedding(asset: {
  type: string
  title?: string | null
  content: string
  source_platform?: string | null
  source_url?: string | null
  tags?: string[]
}) {
  const parts: string[] = []
  if (asset.title) parts.push(asset.title)
  if (asset.source_platform) parts.push(asset.source_platform)
  if (asset.source_url) parts.push(asset.source_url)
  if (Array.isArray(asset.tags) && asset.tags.length) parts.push(asset.tags.join(', '))
  if (asset.content) parts.push(asset.content)
  return parts.join('\n\n').trim()
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') || '').trim()
    const type = (url.searchParams.get('type') || '').trim()
    const publicationParam = (url.searchParams.get('publication_id') || '').trim()

    const limitParam = Number(url.searchParams.get('limit') || '20')
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(100, limitParam)) : 20

    const seedLimitParam = Number(url.searchParams.get('seed') || '100')
    const seed = Number.isFinite(seedLimitParam) ? Math.max(0, Math.min(300, seedLimitParam)) : 100

    const maxUpsertsParam = Number(url.searchParams.get('maxUpserts') || '25')
    const maxUpserts = Number.isFinite(maxUpsertsParam)
      ? Math.max(0, Math.min(50, maxUpsertsParam))
      : 25

    finalMeta = {
      q_len: q.length,
      type: type || null,
      publication_filter: publicationParam || null,
      limit,
      seed,
      max_upserts: maxUpserts,
    }

    try {
      const run = await startJobRun('assets.search', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!q) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'Missing q' }, { status: 400 })
    }

    if (type && !ALLOWED_TYPES.includes(type as AssetType)) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'invalid_type' }
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    const publicationId =
      !publicationParam || publicationParam === 'none' || publicationParam === 'null'
        ? null
        : publicationParam

    if (publicationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(publicationId)) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'invalid_publication_id' }
      return NextResponse.json({ error: 'Invalid publication_id' }, { status: 400 })
    }

    const admin = createAdminClient()
    if (!admin) {
      finalErrorMessage = 'Server missing Supabase admin configuration.'
      return NextResponse.json(
        { error: 'Server missing Supabase admin configuration.' },
        { status: 500 },
      )
    }

    const actor = await resolveActor(req, admin)
    if (!actor) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'unauthorized' }
      return NextResponse.json(
        { error: 'Semantic search requires login + OpenAI key (or Pro managed key).' },
        { status: 401 },
      )
    }

    finalMeta = { ...finalMeta, user_id: actor.userId }

    if (publicationId) {
      const { data: pub, error: pubError } = await admin
        .from('publications')
        .select('id')
        .eq('id', publicationId)
        .eq('owner_id', actor.userId)
        .maybeSingle()
      if (pubError) {
        return NextResponse.json({ error: 'Failed to validate publication.' }, { status: 500 })
      }
      if (!pub) {
        return NextResponse.json({ error: 'Invalid publication_id' }, { status: 400 })
      }
    }

    try {
      await enforceUsageCaps({ supabase: admin, userId: actor.userId, provider: 'openai' })
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || 'Usage cap reached.' },
        { status: 429 },
      )
    }

    // Ensure we have embeddings for latest assets (small capped batch).
    if (seed > 0) {
      let seedQuery = admin
        .from('assets')
        .select('id,type,title,content,tags,source_platform,source_url,publication_id,updated_at')
        .eq('user_id', actor.userId)
        .order('created_at', { ascending: false })
        .limit(seed)

      if (publicationId) {
        seedQuery = seedQuery.eq('publication_id', publicationId)
      }

      const { data: seedAssets, error: seedError } = await seedQuery

      if (seedError) throw seedError

      const assetIds = (seedAssets || []).map((a: any) => a.id)
      if (assetIds.length) {
        const { data: existingEmbeddings, error: embError } = await admin
          .from('asset_embeddings')
          .select('asset_id,content_hash')
          .in('asset_id', assetIds)

        if (embError) throw embError

        const hashByAssetId = new Map<string, string>()
        for (const row of existingEmbeddings || []) {
          hashByAssetId.set(row.asset_id, row.content_hash)
        }

        const stale: Array<{ asset_id: string; text: string; hash: string }> = []
        for (const asset of seedAssets || []) {
          if (!asset || !asset.id) continue

          // Skip images unless they're clearly text-based URLs (still low value for embeddings)
          if (asset.type === 'image') continue

          const text = pickTextForAssetEmbedding(asset)
          if (!text) continue

          const hash = sha256(text)
          const existingHash = hashByAssetId.get(asset.id)
          if (!existingHash || existingHash !== hash) {
            stale.push({ asset_id: asset.id, text, hash })
          }
        }

        for (const item of stale.slice(0, maxUpserts)) {
          const embedding = await embedTextWithOpenAI({
            apiKey: actor.openaiKey,
            text: item.text,
            onUsage: (u) => {
              void logProviderUsage({
                userId: actor.userId,
                provider: 'openai',
                model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
                route: '/api/assets/search',
                operation: 'embeddings',
                usage: { prompt_tokens: u.prompt_tokens, total_tokens: u.total_tokens },
                metadata: { kind: 'seed', asset_id: item.asset_id },
              })
            },
          })

          if (embedding.length !== EMBEDDING_DIM) {
            // Safety check; should never happen.
            continue
          }

          const { error: upsertError } = await admin
            .from('asset_embeddings')
            .upsert(
              {
                asset_id: item.asset_id,
                user_id: actor.userId,
                embedding: vectorLiteral(embedding),
                content_hash: item.hash,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'asset_id' },
            )

          if (upsertError) throw upsertError
        }
      }
    }

    // Embed the query.
    const queryEmbedding = await embedTextWithOpenAI({
      apiKey: actor.openaiKey,
      text: q,
      onUsage: (u) => {
        void logProviderUsage({
          userId: actor.userId,
          provider: 'openai',
          model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
          route: '/api/assets/search',
          operation: 'embeddings',
          usage: { prompt_tokens: u.prompt_tokens, total_tokens: u.total_tokens },
          metadata: { kind: 'query' },
        })
      },
    })

    const { data: matches, error: matchError } = await admin.rpc('match_assets', {
      query_embedding: vectorLiteral(queryEmbedding),
      match_count: limit,
      user_filter: actor.userId,
      type_filter: type || null,
      publication_filter: publicationId,
    })

    if (matchError) throw matchError

    const assetIds = (matches || []).map((m: any) => m.asset_id)
    if (!assetIds.length) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'success', results_count: 0 }
      return NextResponse.json({ query: q, results: [] })
    }

    const { data: assets, error: assetsError } = await admin
      .from('assets')
      .select('id,user_id,publication_id,type,title,content,source_platform,source_url,meta,tags,created_at,updated_at')
      .in('id', assetIds)
      .eq('user_id', actor.userId)

    // NOTE: If publicationParam was 'none', we filter down to unassigned assets client-side.
    const filteredByPublication =
      publicationParam === 'none' || publicationParam === 'null'
        ? (assets || []).filter((a: any) => !a.publication_id)
        : assets || []

    if (assetsError) throw assetsError

    const scoreById = new Map<string, number>()
    for (const m of matches || []) {
      scoreById.set(m.asset_id, m.score)
    }

    const ordered = filteredByPublication
      .map((a: any) => ({ ...a, score: scoreById.get(a.id) ?? null }))
      .sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))
    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', results_count: ordered.length }
    return NextResponse.json({ query: q, results: ordered })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to search.'
    return NextResponse.json(
      { error: finalErrorMessage },
      { status: 500 },
    )
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
