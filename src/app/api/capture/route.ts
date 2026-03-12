import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'
import { inngest } from '@/inngest/client'

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

const ALLOWED_TYPES = ['prompt', 'image', 'code', 'text', 'link', 'quote', 'fragment'] as const

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const skipJobRuns = request.headers.get('x-neolog-skip-job-run') === '1'
  const tryStartRun = async (jobName: string, meta: Record<string, any>) => {
    if (skipJobRuns || runId) return
    try {
      const run = await startJobRun(jobName, meta)
      runId = run.id
    } catch {
      // best-effort
    }
  }

  try {
  const body = (await request.json().catch(() => null)) as Body | null

  const assetType = typeof body?.type === 'string' ? body.type : ''
  const content = typeof body?.content === 'string' ? body.content : ''
  const title = typeof body?.title === 'string' ? body.title : null

  const sourcePlatform =
    (typeof body?.source_platform === 'string' ? body.source_platform : null) ||
    (typeof body?.source === 'string' ? body.source : null)

  const sourceUrl =
    (typeof body?.source_url === 'string' ? body.source_url : null) ||
    (typeof body?.sourceUrl === 'string' ? body.sourceUrl : null)

  const tags = normalizeTags(body?.tags)
  const meta = body?.meta && typeof body.meta === 'object' ? body.meta : {}

  const publicationIdRaw =
    (typeof body?.publication_id === 'string' ? body.publication_id : null) ||
    (typeof body?.publicationId === 'string' ? body.publicationId : null)
  const publicationId = publicationIdRaw?.trim() || ''
  const normalizedPublicationId = !publicationId || publicationId === 'none' || publicationId === 'null'
    ? null
    : publicationId

  if (normalizedPublicationId && !isUuid(normalizedPublicationId)) {
    return NextResponse.json({ error: 'Invalid publication_id' }, { status: 400 })
  }

  if (!assetType) {
    return NextResponse.json({ error: 'type is required' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(assetType as any)) {
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

    finalMeta = {
      user_id: auth.userId,
      auth_mode: 'api_key',
      asset_type: assetType,
      publication_id: normalizedPublicationId,
      tags_count: Array.isArray(tags) ? tags.length : 0,
      has_title: Boolean(title),
      source_platform: sourcePlatform,
      has_source_url: Boolean(sourceUrl),
    }
    await tryStartRun('capture', finalMeta)

    const admin = createAdminClient()
    if (!admin) {
      finalErrorMessage = 'Server misconfigured.'
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
        finalErrorMessage = 'Failed to validate publication.'
        return NextResponse.json({ error: 'Failed to validate publication.' }, { status: 500 })
      }
      if (!pub) {
        finalErrorMessage = 'Invalid publication_id'
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
      finalErrorMessage = 'Failed to create asset.'
      return NextResponse.json({ error: 'Failed to create asset.' }, { status: 500 })
    }

    // Create log_entry and queue entity extraction
    const { data: logEntry } = await admin
      .from('log_entries')
      .insert({
        user_id: auth.userId,
        entry_type: 'capture',
        title: title || content.substring(0, 80),
        body: content,
        logged_at: new Date().toISOString(),
        meta: { asset_id: data.id, source_platform: sourcePlatform, tags },
      })
      .select('id')
      .single()

    if (logEntry) {
      await inngest.send({
        name: 'capture/text.created',
        data: { user_id: auth.userId, log_entry_id: logEntry.id, content },
      })
    }

    finalStatus = 'success'
    finalMeta = {
      ...finalMeta,
      asset_id: data.id,
    }
    return NextResponse.json({ ok: true, id: data.id })
  }

  // Session path
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  finalMeta = {
    user_id: session.user.id,
    auth_mode: 'session',
    asset_type: assetType,
    publication_id: normalizedPublicationId,
    tags_count: Array.isArray(tags) ? tags.length : 0,
    has_title: Boolean(title),
    source_platform: sourcePlatform,
    has_source_url: Boolean(sourceUrl),
  }
  await tryStartRun('capture', finalMeta)

  if (normalizedPublicationId) {
    const { data: pub, error: pubError } = await supabase
      .from('publications')
      .select('id')
      .eq('id', normalizedPublicationId)
      .eq('owner_id', session.user.id)
      .maybeSingle()
    if (pubError) {
      finalErrorMessage = 'Failed to validate publication.'
      return NextResponse.json({ error: 'Failed to validate publication.' }, { status: 500 })
    }
    if (!pub) {
      finalErrorMessage = 'Invalid publication_id'
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
    finalErrorMessage = 'Failed to create asset.'
    return NextResponse.json({ error: 'Failed to create asset.' }, { status: 500 })
  }

  // Create log_entry and queue entity extraction
  const adminForCapture = createAdminClient()
  if (adminForCapture) {
    const { data: logEntry } = await adminForCapture
      .from('log_entries')
      .insert({
        user_id: session.user.id,
        entry_type: 'capture',
        title: title || content.substring(0, 80),
        body: content,
        logged_at: new Date().toISOString(),
        meta: { asset_id: data.id, source_platform: sourcePlatform, tags },
      })
      .select('id')
      .single()

    if (logEntry) {
      await inngest.send({
        name: 'capture/text.created',
        data: { user_id: session.user.id, log_entry_id: logEntry.id, content },
      })
    }
  }

  finalStatus = 'success'
  finalMeta = {
    ...finalMeta,
    asset_id: data.id,
  }
  return NextResponse.json({ ok: true, id: data.id })
  } catch (err: any) {
    console.error('Capture API error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
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
