export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

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
    const run = await startJobRun('inbox.webhook', { user_id: auth.userId })
    runId = run.id
  } catch {
    // best-effort
  }

  const body = await request.json().catch(() => ({}))

  const sourceType = typeof body.sourceType === 'string' ? body.sourceType : 'webhook'
  const title = typeof body.title === 'string' ? body.title : null
  const canonicalUrl = typeof body.canonicalUrl === 'string' ? body.canonicalUrl : null
  const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : null
  const rawData = body.rawData && typeof body.rawData === 'object' ? body.rawData : {}

  const { data, error } = await admin
    .from('inbox_items')
    .insert({
      user_id: auth.userId,
      source_type: sourceType,
      title,
      canonical_url: canonicalUrl,
      source_url: sourceUrl,
      raw_data: rawData,
      status: 'new',
    })
    .select('id')
    .single()

  if (error || !data) {
    await finish(
      'error',
      { user_id: auth.userId, source_type: sourceType, has_canonical_url: Boolean(canonicalUrl) },
      error?.message || 'Failed to create inbox item.',
    )
    return NextResponse.json({ error: 'Failed to create inbox item.' }, { status: 500 })
  }

  await finish('success', {
    user_id: auth.userId,
    inbox_item_id: data.id,
    source_type: sourceType,
    has_canonical_url: Boolean(canonicalUrl),
  })
  return NextResponse.json({ id: data.id })
}
