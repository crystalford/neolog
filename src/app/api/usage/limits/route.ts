import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('provider_usage_limits')
    .select('provider, period, token_limit, updated_at')
    .eq('user_id', session.user.id)
    .order('provider', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Failed to load usage limits.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, limits: data || [] })
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as
    | {
        limits?: Array<{ provider: string; period: 'day' | 'month'; token_limit: number | null }>
      }
    | null

  const limits = Array.isArray(body?.limits) ? body!.limits : []

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
      return NextResponse.json({ error: 'Failed to save usage limits.' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
