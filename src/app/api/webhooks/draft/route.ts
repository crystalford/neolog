import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { marked } from 'marked'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export const dynamic = 'force-dynamic'

type Body = {
  title?: unknown
  content?: unknown
  content_type?: unknown
  tags?: unknown
  source_tool?: unknown
  canonical_url?: unknown
  source_url?: unknown
  meta?: unknown
}

export async function POST(request: NextRequest) {
  const auth = await requireAutomationKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

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

  const admin = createAdminClient()
  if (!admin) {
    await finish('error', { user_id: auth.userId }, 'Server misconfigured.')
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  try {
    const run = await startJobRun('webhooks.draft', { user_id: auth.userId })
    runId = run.id
  } catch {
    // best-effort
  }

  const body = (await request.json().catch(() => null)) as Body | null

  const title = typeof body?.title === 'string' ? body.title : null
  const content = typeof body?.content === 'string' ? body.content : ''
  const contentType = typeof body?.content_type === 'string' ? body.content_type : 'markdown'
  const tags = Array.isArray(body?.tags) ? body?.tags.filter((t) => typeof t === 'string') : []
  const sourceTool = typeof body?.source_tool === 'string' ? body.source_tool : null
  const canonicalUrl = typeof body?.canonical_url === 'string' ? body.canonical_url : null
  const sourceUrl = typeof body?.source_url === 'string' ? body.source_url : null
  const meta = body?.meta && typeof body.meta === 'object' ? body.meta : {}

  const contentHtml =
    contentType === 'markdown'
      ? String(marked.parse(content || ''))
      : content

  // V1 behavior: store as an inbox artifact (consistent with supply chain).
  // Draft creation happens via Inbox → Draft conversion.
  const rawData = {
    title,
    content,
    content_html: contentHtml,
    content_type: contentType,
    tags,
    source_tool: sourceTool,
    canonical_url: canonicalUrl,
    source_url: sourceUrl,
    meta,
  }

  const { data, error } = await admin
    .from('inbox_items')
    .insert({
      user_id: auth.userId,
      source_type: 'draft_webhook',
      title,
      canonical_url: canonicalUrl,
      source_url: sourceUrl,
      raw_data: rawData,
      status: 'new',
    })
    .select('id')
    .single()

  if (error || !data) {
    await finish('error', { user_id: auth.userId, content_type: contentType, tags_count: tags.length }, error?.message || 'Failed to create inbox item.')
    return NextResponse.json({ error: 'Failed to create inbox item.' }, { status: 500 })
  }

  await finish('success', {
    user_id: auth.userId,
    inbox_item_id: data.id,
    content_type: contentType,
    tags_count: tags.length,
    has_canonical_url: Boolean(canonicalUrl),
    source_tool: sourceTool,
  })
  return NextResponse.json({ ok: true, inboxItemId: data.id })
}
