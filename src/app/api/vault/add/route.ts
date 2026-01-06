import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export const dynamic = 'force-dynamic'

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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

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

  const body = (await request.json().catch(() => null)) as Body | null
  const assetType = typeof body?.type === 'string' ? body.type : ''
  const content = typeof body?.content === 'string' ? body.content : ''
  const title = typeof body?.title === 'string' ? body.title : null
  const tags = normalizeTags(body?.tags)
  const publicationIdRaw =
    (typeof body?.publication_id === 'string' ? body.publication_id : null) ||
    (typeof body?.publicationId === 'string' ? body.publicationId : null)
  const publicationId = publicationIdRaw?.trim() || ''
  const normalizedPublicationId = !publicationId || publicationId === 'none' || publicationId === 'null'
    ? null
    : publicationId
  const sourcePlatform =
    (typeof body?.source_platform === 'string' ? body.source_platform : null) ||
    (typeof body?.source === 'string' ? body.source : null)
  const sourceUrl =
    (typeof body?.source_url === 'string' ? body.source_url : null) ||
    (typeof body?.sourceUrl === 'string' ? body.sourceUrl : null)
  const meta = body?.meta && typeof body.meta === 'object' ? body.meta : {}

  if (normalizedPublicationId && !isUuid(normalizedPublicationId)) {
    return NextResponse.json({ error: 'Invalid publication_id' }, { status: 400 })
  }

  if (!assetType) {
    return NextResponse.json({ error: 'type is required' }, { status: 400 })
  }

  if (!['prompt', 'image', 'code', 'text', 'link', 'quote', 'fragment'].includes(assetType)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  // Accept either API key (server/admin insert) OR logged-in session (RLS insert).
  const rawKey =
    request.headers.get('x-api-key') ||
    request.headers.get('x-neolog-key') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''

  const hasAutomationKey = Boolean(rawKey.trim())

  // API-key path (only if an API key was actually provided)
  if (hasAutomationKey) {
    const auth = await requireAutomationKey(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    try {
      const run = await startJobRun('vault.add', {
        user_id: auth.userId,
        auth: 'automation_key',
        type: assetType,
        publication_id: normalizedPublicationId,
      })
      runId = run.id
    } catch {
      // best-effort
    }

    const admin = createAdminClient()
    if (!admin) {
      await finish('error', { user_id: auth.userId }, 'Server misconfigured.')
      return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
    }

    if (normalizedPublicationId) {
      const { data: pub, error: pubError } = await admin
        .from('publications')
        .select('id')
        .eq('id', normalizedPublicationId)
        .eq('owner_id', auth.userId)
        .maybeSingle()
      if (pubError) {
        await finish('error', { user_id: auth.userId, publication_id: normalizedPublicationId }, 'Failed to validate publication.')
        return NextResponse.json({ error: 'Failed to validate publication.' }, { status: 500 })
      }
      if (!pub) {
        await finish('error', { user_id: auth.userId, publication_id: normalizedPublicationId }, 'Invalid publication_id')
        return NextResponse.json({ error: 'Invalid publication_id' }, { status: 400 })
      }
    }

    const { data, error } = await admin
      .from('assets')
      .insert({
        user_id: auth.userId,
        publication_id: normalizedPublicationId,
        type: assetType,
        content,
        title,
        source_platform: sourcePlatform,
        source_url: sourceUrl,
        tags,
        meta,
      })
      .select('id')
      .single()

    if (error || !data) {
      await finish('error', { user_id: auth.userId, type: assetType, publication_id: normalizedPublicationId }, error?.message || 'Failed to create asset.')
      return NextResponse.json({ error: 'Failed to create asset.' }, { status: 500 })
    }

    await finish('success', {
      user_id: auth.userId,
      auth: 'automation_key',
      asset_id: data.id,
      type: assetType,
      publication_id: normalizedPublicationId,
      tags_count: tags.length,
    })
    return NextResponse.json({ ok: true, id: data.id })
  }

  // Session path
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const run = await startJobRun('vault.add', {
      user_id: session.user.id,
      auth: 'session',
      type: assetType,
      publication_id: normalizedPublicationId,
    })
    runId = run.id
  } catch {
    // best-effort
  }

  if (normalizedPublicationId) {
    const { data: pub, error: pubError } = await supabase
      .from('publications')
      .select('id')
      .eq('id', normalizedPublicationId)
      .eq('owner_id', session.user.id)
      .maybeSingle()
    if (pubError) {
      await finish('error', { user_id: session.user.id, publication_id: normalizedPublicationId }, 'Failed to validate publication.')
      return NextResponse.json({ error: 'Failed to validate publication.' }, { status: 500 })
    }
    if (!pub) {
      await finish('error', { user_id: session.user.id, publication_id: normalizedPublicationId }, 'Invalid publication_id')
      return NextResponse.json({ error: 'Invalid publication_id' }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from('assets')
    .insert({
      user_id: session.user.id,
      publication_id: normalizedPublicationId,
      type: assetType,
      content,
      title,
      source_platform: sourcePlatform,
      source_url: sourceUrl,
      tags,
      meta,
    })
    .select('id')
    .single()

  if (error || !data) {
    await finish('error', { user_id: session.user.id, type: assetType, publication_id: normalizedPublicationId }, error?.message || 'Failed to create asset.')
    return NextResponse.json({ error: 'Failed to create asset.' }, { status: 500 })
  }

  await finish('success', {
    user_id: session.user.id,
    auth: 'session',
    asset_id: data.id,
    type: assetType,
    publication_id: normalizedPublicationId,
    tags_count: tags.length,
  })
  return NextResponse.json({ ok: true, id: data.id })
}
