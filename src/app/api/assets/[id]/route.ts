export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export const dynamic = 'force-dynamic'

type AssetType = 'prompt' | 'image' | 'code' | 'text' | 'link' | 'quote' | 'fragment'

const ALLOWED_TYPES: AssetType[] = ['prompt', 'image', 'code', 'text', 'link', 'quote', 'fragment']

type PatchBody = {
  type?: unknown
  title?: unknown
  content?: unknown
  tags?: unknown
  meta?: unknown
  source_platform?: unknown
  source_url?: unknown
  publication_id?: unknown
  publicationId?: unknown
}

function normalizeTags(input: unknown): string[] {
  const tags = Array.isArray(input) ? input : []
  return tags
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50)
}

function getAuthKey(request: NextRequest): string {
  return (
    request.headers.get('x-api-key') ||
    request.headers.get('x-neolog-key') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  ).trim()
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

async function resolveUser(request: NextRequest): Promise<
  | { ok: true; userId: string; mode: 'admin' | 'session' }
  | { ok: false; status: number; error: string }
> {
  const rawKey = getAuthKey(request)
  if (rawKey) {
    const auth = await requireAutomationKey(request)
    if (!auth.ok) return { ok: false, status: 401, error: auth.error }
    return { ok: true, userId: auth.userId, mode: 'admin' }
  }

  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return { ok: false, status: 401, error: 'Unauthorized' }
  return { ok: true, userId: session.user.id, mode: 'session' }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = { asset_id: params.id }
  let finalErrorMessage: string | undefined = undefined

  const includeUsedIn = request.nextUrl.searchParams.get('includeUsedIn') === '1'
  finalMeta = { ...finalMeta, include_used_in: includeUsedIn }

  const auth = await resolveUser(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  finalMeta = { ...finalMeta, user_id: auth.userId, mode: auth.mode }
  try {
    const run = await startJobRun('assets.get', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  try {

  const db = auth.mode === 'admin' ? createAdminClient() : createClient()
  if (!db) {
    finalErrorMessage = 'Server misconfigured.'
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  const { data: asset, error } = await db
    .from('assets')
    .select(
      'id, user_id, publication_id, type, title, content, source_platform, source_url, meta, tags, created_at, updated_at',
    )
    .eq('id', params.id)
    .eq('user_id', auth.userId)
    .single()

  if (error || !asset) {
    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'not_found' }
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!includeUsedIn) {
    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success' }
    return NextResponse.json({ ok: true, asset })
  }

  // Used in: via post_assets -> posts
  const { data: links, error: linksError } = await db
    .from('post_assets')
    .select('post_id, created_at')
    .eq('asset_id', params.id)
    .order('created_at', { ascending: false })

  if (linksError) {
    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', used_in_count: 0 }
    return NextResponse.json({ ok: true, asset, usedIn: [] })
  }

  const postIds = (links || []).map((l: any) => l.post_id).filter(Boolean)
  if (!postIds.length) {
    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', used_in_count: 0 }
    return NextResponse.json({ ok: true, asset, usedIn: [] })
  }

  const { data: posts } = await db
    .from('posts')
    .select('id, title, slug, status, published_at, created_at')
    .in('id', postIds)
    .eq('author_id', auth.userId)

  const postById = new Map((posts || []).map((p: any) => [p.id, p]))
  const usedIn = (links || [])
    .map((l: any) => {
      const p = postById.get(l.post_id)
      if (!p) return null
      return { post: p, linked_at: l.created_at }
    })
    .filter(Boolean)

  finalStatus = 'success'
  finalMeta = { ...finalMeta, result: 'success', used_in_count: usedIn.length }
  return NextResponse.json({ ok: true, asset, usedIn })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to load asset.'
    return NextResponse.json({ error: 'Failed to load asset.' }, { status: 500 })
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = { asset_id: params.id }
  let finalErrorMessage: string | undefined = undefined

  const auth = await resolveUser(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  finalMeta = { ...finalMeta, user_id: auth.userId, mode: auth.mode }
  try {
    const run = await startJobRun('assets.update', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  try {

  const body = (await request.json().catch(() => null)) as PatchBody | null

  const patch: Record<string, any> = {}

  if (body?.publication_id !== undefined || body?.publicationId !== undefined) {
    const raw =
      (typeof body.publication_id === 'string' ? body.publication_id : null) ||
      (typeof body.publicationId === 'string' ? body.publicationId : null)

    const normalized = raw?.trim() || ''
    if (!normalized || normalized === 'none' || normalized === 'null') {
      patch.publication_id = null
    } else {
      if (!isUuid(normalized)) {
        return NextResponse.json({ error: 'Invalid publication_id' }, { status: 400 })
      }

      const dbForPubCheck = auth.mode === 'admin' ? createAdminClient() : createClient()
      if (!dbForPubCheck) {
        return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
      }

      const { data: pub, error: pubError } = await dbForPubCheck
        .from('publications')
        .select('id')
        .eq('id', normalized)
        .eq('owner_id', auth.userId)
        .maybeSingle()

      if (pubError) {
        return NextResponse.json({ error: 'Failed to validate publication.' }, { status: 500 })
      }
      if (!pub) {
        return NextResponse.json({ error: 'Invalid publication_id' }, { status: 400 })
      }
      patch.publication_id = normalized
    }
  }

  if (typeof body?.type === 'string') {
    if (!ALLOWED_TYPES.includes(body.type as AssetType)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }
    patch.type = body.type
  }

  if (typeof body?.title === 'string' || body?.title === null) {
    patch.title = typeof body.title === 'string' ? body.title : null
  }

  if (typeof body?.content === 'string') {
    const c = body.content.trim()
    if (!c) return NextResponse.json({ error: 'content is required' }, { status: 400 })
    patch.content = c
    finalMeta = { ...finalMeta, content_len: c.length }
  }

  if (body?.tags !== undefined) {
    patch.tags = normalizeTags(body.tags)
    finalMeta = { ...finalMeta, tags_count: Array.isArray(patch.tags) ? patch.tags.length : 0 }
  }

  if (body?.meta !== undefined) {
    if (body.meta && typeof body.meta === 'object') {
      patch.meta = body.meta
    } else if (body.meta === null) {
      patch.meta = {}
    } else {
      return NextResponse.json({ error: 'meta must be an object' }, { status: 400 })
    }
  }

  if (typeof body?.source_platform === 'string' || body?.source_platform === null) {
    patch.source_platform = typeof body.source_platform === 'string' ? body.source_platform : null
  }

  if (typeof body?.source_url === 'string' || body?.source_url === null) {
    patch.source_url = typeof body.source_url === 'string' ? body.source_url : null
  }

  if (Object.keys(patch).length === 0) {
    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'no_changes' }
    return NextResponse.json({ error: 'No changes' }, { status: 400 })
  }

  patch.updated_at = new Date().toISOString()

  const db = auth.mode === 'admin' ? createAdminClient() : createClient()
  if (!db) {
    finalErrorMessage = 'Server misconfigured.'
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  const { data, error } = await db
    .from('assets')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', auth.userId)
    .select('id')
    .single()

  if (error || !data) {
    finalErrorMessage = 'Failed to update asset.'
    return NextResponse.json({ error: 'Failed to update asset.' }, { status: 500 })
  }

  finalStatus = 'success'
  finalMeta = { ...finalMeta, result: 'success', changed_fields: Object.keys(patch).filter((k) => k !== 'updated_at').length }
  return NextResponse.json({ ok: true })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to update asset.'
    return NextResponse.json({ error: 'Failed to update asset.' }, { status: 500 })
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = { asset_id: params.id }
  let finalErrorMessage: string | undefined = undefined

  const auth = await resolveUser(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  finalMeta = { ...finalMeta, user_id: auth.userId, mode: auth.mode }
  try {
    const run = await startJobRun('assets.delete', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  try {

  const db = auth.mode === 'admin' ? createAdminClient() : createClient()
  if (!db) {
    finalErrorMessage = 'Server misconfigured.'
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  const { error } = await db
    .from('assets')
    .delete()
    .eq('id', params.id)
    .eq('user_id', auth.userId)

  if (error) {
    finalErrorMessage = 'Failed to delete asset.'
    return NextResponse.json({ error: 'Failed to delete asset.' }, { status: 500 })
  }

  finalStatus = 'success'
  finalMeta = { ...finalMeta, result: 'success' }
  return NextResponse.json({ ok: true })
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

