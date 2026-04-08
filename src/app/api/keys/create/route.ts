export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'node:crypto'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

const hashKey = (key: string) =>
  crypto.createHash('sha256').update(key).digest('hex')

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
    const label = typeof body.label === 'string' ? body.label : null

    finalMeta = { user_id: session.user.id, has_label: Boolean(label) }
    try {
      const run = await startJobRun('keys.create', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    const rawKey = `neo_${crypto.randomBytes(24).toString('hex')}`
    const keyHash = hashKey(rawKey)

    const { error } = await supabase
      .from('api_keys')
      .insert({
        user_id: session.user.id,
        label,
        key_hash: keyHash,
      })

    if (error) {
      finalErrorMessage = 'Failed to create key.'
      return NextResponse.json({ error: 'Failed to create key.' }, { status: 500 })
    }

    finalStatus = 'success'
    return NextResponse.json({ key: rawKey })
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
