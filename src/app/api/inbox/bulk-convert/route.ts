export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { marked } from 'marked'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export const dynamic = 'force-dynamic'

type Body = {
  inboxItemIds?: unknown
  publicationId?: unknown
}

type InboxItemRow = {
  id: string
  title: string | null
  canonical_url: string | null
  source_type: string
  status: 'new' | 'imported' | 'ignored'
  raw_data: any
}

function toHtmlFromInboxRawData(rawData: any): { original: string; html: string; contentType: 'html' | 'markdown' } {
  const contentTypeRaw = rawData?.content_type
  const contentType: 'html' | 'markdown' = contentTypeRaw === 'markdown' ? 'markdown' : 'html'

  const original = String(rawData?.content_html || rawData?.content || rawData?.description || '')
  const html =
    contentType === 'markdown'
      ? String(marked.parse(original || ''))
      : original

  return { original, html, contentType }
}

function slugifyTitle(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function stableHashHex6(input: string): string {
  return (
    input
      .split('')
      // simple deterministic 32-bit hash
      .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7)
      .toString(16)
      .slice(0, 6)
  )
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

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

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const run = await startJobRun('inbox.bulk_convert', { user_id: session.user.id })
    runId = run.id
  } catch {
    // best-effort
  }

  try {
    const body = (await request.json().catch(() => null)) as Body | null
    const inboxItemIdsRaw = body?.inboxItemIds
    const publicationIdRaw = body?.publicationId

    const inboxItemIds = Array.isArray(inboxItemIdsRaw)
      ? inboxItemIdsRaw.filter((v): v is string => typeof v === 'string' && v.length > 0)
      : []

    const publicationId = typeof publicationIdRaw === 'string' ? publicationIdRaw : ''

    if (!publicationId) {
      await finish('error', { user_id: session.user.id }, 'publicationId is required')
      return NextResponse.json({ error: 'publicationId is required' }, { status: 400 })
    }

    if (inboxItemIds.length === 0) {
      await finish('error', { user_id: session.user.id, publication_id: publicationId }, 'inboxItemIds is required')
      return NextResponse.json({ error: 'inboxItemIds is required' }, { status: 400 })
    }

    // Validate publication ownership (avoid converting into someone else's publication)
    const { data: publication, error: publicationError } = await supabase
      .from('publications')
      .select('id, owner_id, is_active')
      .eq('id', publicationId)
      .maybeSingle()

    if (publicationError || !publication) {
      await finish('error', { user_id: session.user.id, publication_id: publicationId }, 'Publication not found')
      return NextResponse.json({ error: 'Publication not found' }, { status: 404 })
    }

    if (publication.owner_id !== session.user.id) {
      await finish('error', { user_id: session.user.id, publication_id: publicationId }, 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!publication.is_active) {
      await finish('error', { user_id: session.user.id, publication_id: publicationId }, 'Publication is inactive')
      return NextResponse.json({ error: 'Publication is inactive' }, { status: 400 })
    }

    const { data: inboxItems, error: inboxError } = await supabase
      .from('inbox_items')
      .select('id, title, canonical_url, source_type, status, raw_data')
      .in('id', inboxItemIds)
      .eq('user_id', session.user.id)

    if (inboxError) {
      await finish(
        'error',
        { user_id: session.user.id, publication_id: publicationId, inbox_items_requested: inboxItemIds.length },
        'Failed to load inbox items',
      )
      return NextResponse.json({ error: 'Failed to load inbox items' }, { status: 500 })
    }

  const byId = new Map<string, InboxItemRow>()
  for (const item of (inboxItems || []) as InboxItemRow[]) {
    byId.set(item.id, item)
  }

  const results: Array<{
    inboxItemId: string
    status: 'converted' | 'skipped' | 'failed'
    postId?: string
    error?: string
  }> = []

  const convertedInboxIds: string[] = []

  for (const id of inboxItemIds) {
    const item = byId.get(id)
    if (!item) {
      results.push({ inboxItemId: id, status: 'failed', error: 'Not found' })
      continue
    }

    if (item.status !== 'new') {
      results.push({ inboxItemId: id, status: 'skipped' })
      continue
    }

    const title = item.title || item.raw_data?.title || 'Imported draft'
    const content = toHtmlFromInboxRawData(item.raw_data)

    const baseSlug = slugifyTitle(String(title))
    const canonical = String(item.canonical_url || '')
    const hash = canonical ? stableHashHex6(canonical) : item.id.slice(0, 6)

    const fallbackBase = baseSlug || `import-${item.id.slice(0, 8)}`
    const slugCandidates = [
      fallbackBase,
      `${fallbackBase.slice(0, 72)}-${hash}`,
      `${fallbackBase.slice(0, 68)}-${hash}-${Date.now().toString(36).slice(-4)}`,
    ]

    let createdPostId: string | null = null
    let lastError: any = null

    for (const slug of slugCandidates) {
      const attempt = await supabase
        .from('posts')
        .insert({
          author_id: session.user.id,
          publication_id: publicationId,
          title,
          slug,
          content: content.original,
          content_html: content.html,
          content_type: content.contentType,
          status: 'draft',
          canonical_url: item.canonical_url,
          original_source: item.source_type,
        })
        .select('id')
        .maybeSingle()

      if (attempt.data?.id && !attempt.error) {
        createdPostId = attempt.data.id as string
        break
      }

      lastError = attempt.error
      const code = String((attempt.error as any)?.code || '')
      if (code !== '23505') {
        break
      }
    }

    if (!createdPostId) {
      results.push({
        inboxItemId: id,
        status: 'failed',
        error: lastError?.message || 'Failed to create draft',
      })
      continue
    }

    convertedInboxIds.push(id)
    results.push({ inboxItemId: id, status: 'converted', postId: createdPostId })
  }

  if (convertedInboxIds.length > 0) {
    await supabase
      .from('inbox_items')
      .update({ status: 'imported' })
      .in('id', convertedInboxIds)
      .eq('user_id', session.user.id)
  }

  const summary = {
    converted: results.filter((r) => r.status === 'converted').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
  }

  await finish('success', {
    user_id: session.user.id,
    publication_id: publicationId,
    inbox_items_requested: inboxItemIds.length,
    converted: summary.converted,
    skipped: summary.skipped,
    failed: summary.failed,
  })

  return NextResponse.json({ ok: true, summary, results })
  } catch (e: any) {
    await finish('error', { user_id: session.user.id }, e?.message || 'Unknown error')
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
