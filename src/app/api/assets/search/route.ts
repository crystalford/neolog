import { NextRequest, NextResponse } from 'next/server'

import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { embedTextWithOpenAI, sha256, vectorLiteral, EMBEDDING_DIM } from '@/lib/embeddings'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { logProviderUsage } from '@/lib/usage'
import { enforceUsageCaps } from '@/lib/usageCaps'

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
  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') || '').trim()
    const type = (url.searchParams.get('type') || '').trim()

    const limitParam = Number(url.searchParams.get('limit') || '20')
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(100, limitParam)) : 20

    if (!q) {
      return NextResponse.json({ error: 'Missing q' }, { status: 400 })
    }

    if (type && !ALLOWED_TYPES.includes(type as AssetType)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json(
        { error: 'Server missing Supabase admin configuration.' },
        { status: 500 },
      )
    }

    const actor = await resolveActor(req, admin)
    if (!actor) {
      return NextResponse.json(
        { error: 'Semantic search requires login + OpenAI key (or Pro managed key).' },
        { status: 401 },
      )
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
    const seedLimitParam = Number(url.searchParams.get('seed') || '100')
    const seed = Number.isFinite(seedLimitParam) ? Math.max(0, Math.min(300, seedLimitParam)) : 100

    if (seed > 0) {
      const { data: seedAssets, error: seedError } = await admin
        .from('assets')
        .select('id,type,title,content,tags,source_platform,source_url,updated_at')
        .eq('user_id', actor.userId)
        .order('created_at', { ascending: false })
        .limit(seed)

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

        const maxUpsertsParam = Number(url.searchParams.get('maxUpserts') || '25')
        const maxUpserts = Number.isFinite(maxUpsertsParam)
          ? Math.max(0, Math.min(50, maxUpsertsParam))
          : 25

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
    })

    if (matchError) throw matchError

    const assetIds = (matches || []).map((m: any) => m.asset_id)
    if (!assetIds.length) {
      return NextResponse.json({ query: q, results: [] })
    }

    const { data: assets, error: assetsError } = await admin
      .from('assets')
      .select('id,user_id,type,title,content,source_platform,source_url,meta,tags,created_at,updated_at')
      .in('id', assetIds)
      .eq('user_id', actor.userId)

    if (assetsError) throw assetsError

    const scoreById = new Map<string, number>()
    for (const m of matches || []) {
      scoreById.set(m.asset_id, m.score)
    }

    const ordered = (assets || [])
      .map((a: any) => ({ ...a, score: scoreById.get(a.id) ?? null }))
      .sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))

    return NextResponse.json({ query: q, results: ordered })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to search.' },
      { status: 500 },
    )
  }
}
