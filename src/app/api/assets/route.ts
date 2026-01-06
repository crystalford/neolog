import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export const dynamic = 'force-dynamic'

type AssetType = 'prompt' | 'image' | 'code' | 'text' | 'link' | 'quote' | 'fragment'

const ALLOWED_TYPES: AssetType[] = ['prompt', 'image', 'code', 'text', 'link', 'quote', 'fragment']

type Body = {
  type?: unknown
  content?: unknown
  title?: unknown
  tags?: unknown
  publication_id?: unknown
  publicationId?: unknown
  source?: unknown
  source_platform?: unknown
  source_url?: unknown
  sourceUrl?: unknown
  meta?: unknown
}

function normalizeTags(input: unknown): string[] {
  const tags = Array.isArray(input) ? input : []
  return tags
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50)
}

function pickString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

function getAuthKey(request: NextRequest): string {
  return (
    request.headers.get('x-api-key') ||
    request.headers.get('x-neolog-key') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  ).trim()
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const url = new URL(request.url)

  const q = (url.searchParams.get('q') || '').trim()
  const type = (url.searchParams.get('type') || '').trim()
  const source = (url.searchParams.get('source') || '').trim()
  const tagsParam = (url.searchParams.get('tags') || '').trim()
  const publicationParam = (url.searchParams.get('publication_id') || url.searchParams.get('publicationId') || '').trim()
  const from = (url.searchParams.get('from') || '').trim()
  const to = (url.searchParams.get('to') || '').trim()

  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 200)))
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0))

  const tags = tagsParam
    ? tagsParam
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 50)
    : []

  const rawKey = getAuthKey(request)
  const hasAutomationKey = Boolean(rawKey)

  // Pick user_id
  let userId: string | null = null
  let mode: 'admin' | 'session' = 'session'

  if (hasAutomationKey) {
    const auth = await requireAutomationKey(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }
    userId = auth.userId
    mode = 'admin'
  } else {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = session.user.id
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  finalMeta = {
    user_id: userId,
    mode,
    q_len: q.length,
    type: type || null,
    source: source || null,
    tags_count: tags.length,
    has_publication_filter: Boolean(publicationParam),
    limit,
    offset,
  }

  try {
    const run = await startJobRun('assets.list', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  const db = mode === 'admin' ? createAdminClient() : createClient()
  if (!db) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  let publicationIdFilter: string | null | undefined = undefined
  try {
    if (publicationParam) {
    if (publicationParam === 'none' || publicationParam === 'null') {
      publicationIdFilter = null
    } else {
      if (!isUuid(publicationParam)) {
        return NextResponse.json({ error: 'Invalid publication_id' }, { status: 400 })
      }

      const { data: pub, error: pubError } = await db
        .from('publications')
        .select('id')
        .eq('id', publicationParam)
        .eq('owner_id', userId)
        .maybeSingle()

      if (pubError) {
        finalErrorMessage = 'Failed to validate publication.'
        return NextResponse.json({ error: 'Failed to validate publication.' }, { status: 500 })
      }
      if (!pub) {
        finalStatus = 'success'
        finalMeta = { ...finalMeta, result: 'invalid_publication_id' }
        return NextResponse.json({ error: 'Invalid publication_id' }, { status: 400 })
      }
      publicationIdFilter = publicationParam
    }
  }

  let query = db
    .from('assets')
    .select(
      'id, user_id, publication_id, type, title, content, source_platform, source_url, meta, tags, created_at, updated_at',
    )
    .eq('user_id', userId)

  if (publicationIdFilter === null) {
    query = query.is('publication_id', null)
  } else if (typeof publicationIdFilter === 'string') {
    query = query.eq('publication_id', publicationIdFilter)
  }

  if (type) {
    if (!ALLOWED_TYPES.includes(type as AssetType)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }
    query = query.eq('type', type)
  }

  if (source) {
    query = query.eq('source_platform', source)
  }

  if (tags.length) {
    query = query.contains('tags', tags)
  }

  if (from) {
    query = query.gte('created_at', from)
  }

  if (to) {
    query = query.lte('created_at', to)
  }

  if (q) {
    const escaped = q.replace(/,/g, '')
    query = query.or(
      `title.ilike.%${escaped}%,content.ilike.%${escaped}%,source_platform.ilike.%${escaped}%,source_url.ilike.%${escaped}%`
    )
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    finalErrorMessage = 'Failed to load assets.'
    return NextResponse.json({ error: 'Failed to load assets.' }, { status: 500 })
  }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', assets_count: (data || []).length }
    return NextResponse.json({ ok: true, assets: data || [] })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to load assets.'
    return NextResponse.json({ error: 'Failed to load assets.' }, { status: 500 })
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

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const body = (await request.json().catch(() => null)) as Body | null

  const assetType = pickString(body?.type) || ''
  const content = pickString(body?.content) || ''
  const title = pickString(body?.title)
  const tags = normalizeTags(body?.tags)

  const publicationIdRaw = pickString(body?.publication_id) || pickString(body?.publicationId)
  const publicationId = publicationIdRaw === 'none' || publicationIdRaw === 'null' ? null : publicationIdRaw

  const sourcePlatform = pickString(body?.source_platform) || pickString(body?.source)
  const sourceUrl = pickString(body?.source_url) || pickString(body?.sourceUrl)

  const meta = body?.meta && typeof body.meta === 'object' ? body.meta : {}

  if (!assetType) {
    return NextResponse.json({ error: 'type is required' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(assetType as AssetType)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }
  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const rawKey = getAuthKey(request)
  const hasAutomationKey = Boolean(rawKey)

  if (publicationId !== null && publicationId !== undefined) {
    if (!isUuid(publicationId)) {
      return NextResponse.json({ error: 'Invalid publication_id' }, { status: 400 })
    }
  }

  finalMeta = {
    type: assetType,
    content_len: content.length,
    has_title: Boolean(title),
    tags_count: tags.length,
    publication_id: publicationId || null,
    has_source_platform: Boolean(sourcePlatform),
    has_source_url: Boolean(sourceUrl),
    mode: hasAutomationKey ? 'admin' : 'session',
  }

  try {
    const run = await startJobRun('assets.create', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  try {
    // continue with existing flow

  if (hasAutomationKey) {
    const auth = await requireAutomationKey(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
    }

    if (publicationId) {
      const { data: pub, error: pubError } = await admin
        .from('publications')
        .select('id')
        .eq('id', publicationId)
        .eq('owner_id', auth.userId)
        .maybeSingle()
      if (pubError) {
        return NextResponse.json({ error: 'Failed to validate publication.' }, { status: 500 })
      }
      if (!pub) {
        return NextResponse.json({ error: 'Invalid publication_id' }, { status: 400 })
      }
    }

    finalMeta = { ...finalMeta, user_id: auth.userId }

    const { data, error } = await admin
      .from('assets')
      .insert({
        user_id: auth.userId,
        publication_id: publicationId ?? null,
        type: assetType,
        title,
        content,
        source_platform: sourcePlatform,
        source_url: sourceUrl,
        tags,
        meta,
      })
      .select('id')
      .single()

    if (error || !data) {
      finalErrorMessage = 'Failed to create asset.'
      return NextResponse.json({ error: 'Failed to create asset.' }, { status: 500 })
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', asset_id: data.id }
    return NextResponse.json({ ok: true, id: data.id })
  }

  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  finalMeta = { ...finalMeta, user_id: session.user.id }

  if (publicationId) {
    const { data: pub, error: pubError } = await supabase
      .from('publications')
      .select('id')
      .eq('id', publicationId)
      .eq('owner_id', session.user.id)
      .maybeSingle()
    if (pubError) {
      finalErrorMessage = 'Failed to validate publication.'
      return NextResponse.json({ error: 'Failed to validate publication.' }, { status: 500 })
    }
    if (!pub) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'invalid_publication_id' }
      return NextResponse.json({ error: 'Invalid publication_id' }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from('assets')
    .insert({
      user_id: session.user.id,
      publication_id: publicationId ?? null,
      type: assetType,
      title,
      content,
      source_platform: sourcePlatform,
      source_url: sourceUrl,
      tags,
      meta,
    })
    .select('id')
    .single()

  if (error || !data) {
    finalErrorMessage = 'Failed to create asset.'
    return NextResponse.json({ error: 'Failed to create asset.' }, { status: 500 })
  }

  finalStatus = 'success'
  finalMeta = { ...finalMeta, result: 'success', asset_id: data.id }
  return NextResponse.json({ ok: true, id: data.id })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to create asset.'
    return NextResponse.json({ error: 'Failed to create asset.' }, { status: 500 })
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
