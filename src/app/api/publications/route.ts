import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export async function GET() {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    finalStatus = 'success'
    finalMeta = { result: 'unauthorized' }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  finalMeta = { user_id: user.id }
  try {
    const run = await startJobRun('publications.list', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  try {
    const { data, error } = await supabase
      .from('publications')
      .select('id,name,slug,is_active')
      .eq('owner_id', user.id)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      finalErrorMessage = error.message
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const publications = (data || []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      slug: p.slug as string,
    }))

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', count: publications.length }
    return NextResponse.json({ publications })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to load publications'
    return NextResponse.json({ error: 'Failed to load publications' }, { status: 500 })
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
