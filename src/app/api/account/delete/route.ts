export const runtime = 'edge'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export async function POST() {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  finalMeta = { user_id: user.id }
  try {
    try {
      const run = await startJobRun('account.delete', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

  const admin = createAdminClient()
  if (!admin) {
    finalErrorMessage = 'Missing Supabase service role key.'
    return NextResponse.json({ error: 'Missing Supabase service role key.' }, { status: 500 })
  }

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    finalErrorMessage = error.message || 'Failed to delete account.'
    return NextResponse.json({ error: error.message || 'Failed to delete account.' }, { status: 500 })
  }

  finalStatus = 'success'
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
