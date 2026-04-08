export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
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

  const postId = request.nextUrl.searchParams.get('postId')
  if (!postId) {
    finalStatus = 'success'
    finalMeta = { user_id: session.user.id, result: 'bad_request' }
    return NextResponse.json({ error: 'postId is required' }, { status: 400 })
  }

  finalMeta = { user_id: session.user.id, post_id: postId }
  try {
    const run = await startJobRun('posts.syndications.list', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  try {
    const { data, error } = await supabase
      .from('post_syndications')
      .select('provider,status,external_id,external_url,error_message,created_at,updated_at')
      .eq('post_id', postId)
      .eq('author_id', session.user.id)
      .order('created_at', { ascending: true })

    if (error) {
      finalErrorMessage = 'Failed to load syndications.'
      return NextResponse.json({ error: 'Failed to load syndications.' }, { status: 500 })
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', count: (data || []).length }
    return NextResponse.json({ syndications: data || [] })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to load syndications.'
    return NextResponse.json({ error: 'Failed to load syndications.' }, { status: 500 })
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
