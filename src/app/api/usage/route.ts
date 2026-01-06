import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const daysRaw = url.searchParams.get('days')
  const days = Math.min(365, Math.max(1, Number(daysRaw || '30') || 30))

  finalMeta = { user_id: session.user.id, days }
  try {
    const run = await startJobRun('usage.summary', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data, error } = await supabase
      .from('provider_usage')
      .select('provider, model, prompt_tokens, completion_tokens, total_tokens, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000)

    if (error) {
      finalErrorMessage = 'Failed to load usage.'
      return NextResponse.json({ error: 'Failed to load usage.' }, { status: 500 })
    }

  const byKey = new Map<
    string,
    {
      provider: string
      model: string | null
      calls: number
      prompt_tokens: number
      completion_tokens: number
      total_tokens: number
    }
  >()

    for (const row of data || []) {
      const provider = row.provider || 'unknown'
      const model = row.model || null
      const key = `${provider}::${model || ''}`

      const cur = byKey.get(key) || {
        provider,
        model,
        calls: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      }

      cur.calls += 1
      cur.prompt_tokens += row.prompt_tokens || 0
      cur.completion_tokens += row.completion_tokens || 0
      cur.total_tokens += row.total_tokens || 0

      byKey.set(key, cur)
    }

    const summary = Array.from(byKey.values()).sort((a, b) => b.total_tokens - a.total_tokens)

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', rows_count: (data || []).length, summary_count: summary.length }
    return NextResponse.json({ ok: true, days, since, summary, rows: data || [] })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to load usage.'
    return NextResponse.json({ error: 'Failed to load usage.' }, { status: 500 })
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
