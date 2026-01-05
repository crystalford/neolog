export type UsageCapPeriod = 'day' | 'month'

function periodStartUtc(period: UsageCapPeriod): string {
  const now = new Date()
  if (period === 'day') {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
    return d.toISOString()
  }

  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
  return d.toISOString()
}

export async function enforceUsageCaps(opts: {
  supabase: any
  userId: string
  provider: string
}): Promise<void> {
  const supabase = opts.supabase
  const userId = opts.userId
  const provider = opts.provider

  try {
    const { data: limits, error } = await supabase
      .from('provider_usage_limits')
      .select('period, token_limit')
      .eq('user_id', userId)
      .eq('provider', provider)

    if (error || !limits || limits.length === 0) return

    for (const limit of limits) {
      const period = limit.period as 'day' | 'month'
      const tokenLimit = Number(limit.token_limit)
      if (!Number.isFinite(tokenLimit)) continue
      if (tokenLimit <= 0) {
        throw new Error(`Usage cap reached (${provider}/${period}).`)
      }

      const since = periodStartUtc(period)
      const { data: total, error: totalError } = await supabase.rpc('sum_provider_usage', {
        p_user_id: userId,
        p_provider: provider,
        p_since: since,
      })

      if (totalError) continue

      const used = typeof total === 'number' ? total : Number(total)
      if (Number.isFinite(used) && used >= tokenLimit) {
        throw new Error(`Usage cap reached (${provider}/${period}).`)
      }
    }
  } catch (e) {
    throw e
  }
}
