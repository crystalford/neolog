import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
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
    const run = await startJobRun('video.heygen.voices', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  try {
    const key = await resolveProviderKeyWithClient(supabase, session.user.id, 'heygen')
    if (!key?.key) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'missing_key' }
      return NextResponse.json({
        error: 'HeyGen API key not configured. Add it in Settings → AI Capture (BYOK).',
      }, { status: 400 })
    }

    const response = await fetch('https://api.heygen.com/v2/voices', {
      headers: {
        accept: 'application/json',
        'x-api-key': key.key,
      },
    })

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      finalErrorMessage = 'Failed to list HeyGen voices.'
      return NextResponse.json({ error: 'Failed to list HeyGen voices.', details: data }, { status: 502 })
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success' }
    return NextResponse.json(data)
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to list HeyGen voices.'
    return NextResponse.json({ error: 'Failed to list HeyGen voices.' }, { status: 500 })
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
