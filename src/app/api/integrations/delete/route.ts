export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const id = typeof body.id === 'string' ? body.id : ''

    finalMeta = { user_id: session.user.id, integration_id: id || null }
    try {
      const run = await startJobRun('integrations.delete', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!id) {
      finalErrorMessage = 'id is required'
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

  const { data: existing } = await supabase
    .from('integration_keys')
    .select('id, provider')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!existing) {
    finalErrorMessage = 'Integration not found.'
    return NextResponse.json({ error: 'Integration not found.' }, { status: 404 })
  }

    finalMeta = { ...finalMeta, provider: existing.provider }

  const { error } = await supabase
    .from('integration_keys')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id)

  if (error) {
    finalErrorMessage = 'Failed to delete integration.'
    return NextResponse.json({ error: 'Failed to delete integration.' }, { status: 500 })
  }

  const { data: remaining } = await supabase
    .from('integration_keys')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('provider', existing.provider)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (remaining?.id) {
    await supabase
      .from('integration_keys')
      .update({ is_active: true })
      .eq('id', remaining.id)
  }

    finalStatus = 'success'
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Internal server error'
    return NextResponse.json({ error: finalErrorMessage }, { status: 500 })
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
