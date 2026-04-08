export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export async function GET() {
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

  finalMeta = { user_id: session.user.id }
  try {
    const run = await startJobRun('usage.limits.get', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  try {
    const { data, error } = await supabase
      .from('provider_usage_limits')
      .select('provider, period, token_limit, updated_at')
      .eq('user_id', session.user.id)
      .order('provider', { ascending: true })

    if (error) {
      // If table doesn't exist yet, return empty list gracefully
      finalStatus = 'success'
      return NextResponse.json({ ok: true, limits: [] })
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', limits_count: (data || []).length }
    return NextResponse.json({ ok: true, limits: data || [] })
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

export async function POST(request: NextRequest) {
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

  try {
    const body = (await request.json().catch(() => null)) as
      | {
          limits?: Array<{ provider: string; period: 'day' | 'month'; token_limit: number | null }>
        }
      | null

    const limits = Array.isArray(body?.limits) ? body!.limits : []

    finalMeta = { user_id: session.user.id, limits_count: limits.length }
    try {
      const run = await startJobRun('usage.limits.save', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    const rows = limits
      .filter((l) => l && typeof l.provider === 'string' && (l.period === 'day' || l.period === 'month'))
      .map((l) => ({
        user_id: session.user.id,
        provider: l.provider,
        period: l.period,
        token_limit: l.token_limit === null ? null : Math.max(0, Math.floor(Number(l.token_limit))),
      }))

    // Delete any null token_limit rows (acts like clearing a cap)
    const toDelete = rows.filter((r) => r.token_limit === null)
    if (toDelete.length) {
      for (const d of toDelete) {
        await supabase
          .from('provider_usage_limits')
          .delete()
          .eq('user_id', session.user.id)
          .eq('provider', d.provider)
          .eq('period', d.period)
      }
    }

    const toUpsert = rows.filter((r) => r.token_limit !== null)
    if (toUpsert.length) {
      const { error } = await supabase
        .from('provider_usage_limits')
        .upsert(toUpsert as any, { onConflict: 'user_id,provider,period' })

      if (error) {
        finalErrorMessage = 'Failed to save usage limits.'
        return NextResponse.json({ error: 'Failed to save usage limits.' }, { status: 500 })
      }
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', upserted_count: toUpsert.length, deleted_count: toDelete.length }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to save usage limits.'
    return NextResponse.json({ error: 'Failed to save usage limits.' }, { status: 500 })
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
