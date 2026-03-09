import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export async function GET() {
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

  finalMeta = { user_id: session.user.id }
  try {
    const run = await startJobRun('keys.list', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  try {
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, label, last_used_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      // If table doesn't exist yet, return empty list gracefully
      finalStatus = 'success'
      return NextResponse.json({ keys: [] })
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, keys_count: (data || []).length }
    return NextResponse.json({ keys: data || [] })
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
