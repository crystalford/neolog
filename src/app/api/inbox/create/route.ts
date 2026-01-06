import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  try {
    const run = await startJobRun('inbox.create', { user_id: session.user.id, auth: 'session' })
    runId = run.id
  } catch {
    // best-effort
  }

  const body = await request.json()
  const sourceType = typeof body.sourceType === 'string' ? body.sourceType : 'manual'
  const title = typeof body.title === 'string' ? body.title : null
  const canonicalUrl = typeof body.canonicalUrl === 'string' ? body.canonicalUrl : null
  const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : null
  const rawData = body.rawData && typeof body.rawData === 'object' ? body.rawData : {}

  const { data, error } = await supabase
    .from('inbox_items')
    .insert({
      user_id: session.user.id,
      source_type: sourceType,
      title,
      canonical_url: canonicalUrl,
      source_url: sourceUrl,
      raw_data: rawData,
      status: 'new',
    })
    .select('id')
    .single()

  if (error) {
    await finish(
      'error',
      { user_id: session.user.id, source_type: sourceType, has_canonical_url: Boolean(canonicalUrl) },
      error.message || 'Failed to create inbox item.',
    )
    return NextResponse.json({ error: 'Failed to create inbox item.' }, { status: 500 })
  }

  await finish('success', {
    user_id: session.user.id,
    inbox_item_id: data?.id,
    source_type: sourceType,
    has_canonical_url: Boolean(canonicalUrl),
  })
  return NextResponse.json({ id: data.id })
}
