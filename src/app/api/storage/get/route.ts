export const runtime = 'edge'
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
    const run = await startJobRun('storage.get', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  try {
    const { data, error } = await supabase
      .from('storage_connections')
      .select('id, provider, access_key_id, bucket, region, endpoint, public_base_url, is_active')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      // If table doesn't exist yet, return null gracefully
      finalStatus = 'success'
      return NextResponse.json({ connection: null })
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, has_connection: Boolean(data), provider: data?.provider || null }
    return NextResponse.json({ connection: data || null })
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
