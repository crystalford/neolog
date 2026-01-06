import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const body = await request.json()
    const { userId, postId, progress, timeSpent } = body

    finalMeta = {
      user_id: typeof userId === 'string' ? userId : null,
      post_id: typeof postId === 'string' ? postId : null,
      has_progress: typeof progress === 'number',
      has_time_spent: typeof timeSpent === 'number',
    }
    try {
      const run = await startJobRun('reading_progress.save', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!userId || !postId) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createClient()
    
    await supabase.rpc('update_reading_progress', {
      p_user_id: userId,
      p_post_id: postId,
      p_progress: progress || 0,
      p_time_spent: timeSpent || 0,
    })

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success' }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reading progress error:', error)
    finalErrorMessage = (error as any)?.message || 'Failed to save progress'
    return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
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
