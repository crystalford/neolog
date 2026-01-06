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

    finalMeta = { user_id: session.user.id, key_id: id || null }
    try {
      const run = await startJobRun('keys.revoke', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!id) {
      finalErrorMessage = 'Key id is required.'
      return NextResponse.json({ error: 'Key id is required.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id)

    if (error) {
      finalErrorMessage = 'Failed to revoke key.'
      return NextResponse.json({ error: 'Failed to revoke key.' }, { status: 500 })
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
