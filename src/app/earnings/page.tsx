'use client'export const runtime = 'edge'


import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { 
  DollarSign, TrendingUp, CreditCard, Loader2, 
  Check, ExternalLink, AlertCircle, PiggyBank
} from 'lucide-react'

type EarningsSummary = {
  total_gross: number
  total_fees: number
  total_net: number
  pending_payout: number
  subscription_earnings: number
  tip_earnings: number
}

export default function EarningsPage() {
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null)
  const [stripeStatus, setStripeStatus] = useState({ connected: false, enabled: false })
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login?redirect=/earnings')
      return
    }

    // Check Stripe status
    const statusRes = await fetch('/api/stripe/connect')
    if (statusRes.ok) {
      const status = await statusRes.json()
      setStripeStatus(status)
    }

    // Get earnings
    const { data } = await supabase.rpc('get_earnings_summary', {
      p_user_id: session.user.id,
    })
    
    if (data && data[0]) {
      setEarnings(data[0])
    }

    setLoading(false)
  }

  const connectStripe = async () => {
    setConnecting(true)
    const res = await fetch('/api/stripe/connect', { method: 'POST' })
    if (res.ok) {
      const { url } = await res.json()
      window.location.href = url
    }
    setConnecting(false)
  }

  const formatCents = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`
  }

  const connected = searchParams.get('connected') === 'true'

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="pt-8 mb-8">
            <h1 className="font-display text-3xl mb-2">Earnings</h1>
            <p className="text-[var(--text-secondary)]">
              Track your revenue from subscriptions and tips
            </p>
          </div>

          {connected && (
            <div className="mb-6 p-4 rounded-lg bg-[var(--success)]/10 border border-[var(--success)]/20 flex items-center gap-3">
              <Check size={20} className="text-[var(--success)]" />
              <p className="text-sm">Stripe account connected successfully!</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
            </div>
          ) : (
            <>
              {/* Stripe Connect Status */}
              {!stripeStatus.enabled && (
                <div className="mb-8 p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                      <CreditCard size={24} className="text-[var(--accent)]" />
                    </div>
                    <div className="flex-1">
                      <h2 className="font-medium text-lg mb-1">
                        {stripeStatus.connected ? 'Complete your Stripe setup' : 'Connect Stripe to get paid'}
                      </h2>
                      <p className="text-sm text-[var(--text-secondary)] mb-4">
                        {stripeStatus.connected 
                          ? 'Your account is connected but needs additional verification before you can receive payouts.'
                          : 'Set up Stripe to receive payments from subscriptions and tips. Takes about 5 minutes.'}
                      </p>
                      <button onClick={connectStripe} disabled={connecting} className="btn btn-primary">
                        {connecting ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Connecting...
                          </>
                        ) : stripeStatus.connected ? (
                          <>
                            Complete Setup
                            <ExternalLink size={16} />
                          </>
                        ) : (
                          <>
                            Connect Stripe
                            <ExternalLink size={16} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Earnings Summary */}
              <div className="grid sm:grid-cols-3 gap-4 mb-8">
                <div className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <div className="flex items-center gap-2 text-[var(--text-tertiary)] mb-2">
                    <DollarSign size={16} />
                    <span className="text-sm">Total Earnings</span>
                  </div>
                  <p className="font-display text-2xl">
                    {formatCents(earnings?.total_net || 0)}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    after {formatCents(earnings?.total_fees || 0)} in fees
                  </p>
                </div>

                <div className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <div className="flex items-center gap-2 text-[var(--text-tertiary)] mb-2">
                    <TrendingUp size={16} />
                    <span className="text-sm">Subscriptions</span>
                  </div>
                  <p className="font-display text-2xl">
                    {formatCents(earnings?.subscription_earnings || 0)}
                  </p>
                </div>

                <div className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <div className="flex items-center gap-2 text-[var(--text-tertiary)] mb-2">
                    <PiggyBank size={16} />
                    <span className="text-sm">Tips</span>
                  </div>
                  <p className="font-display text-2xl">
                    {formatCents(earnings?.tip_earnings || 0)}
                  </p>
                </div>
              </div>

              {/* Pending Payout */}
              {stripeStatus.enabled && (earnings?.pending_payout || 0) > 0 && (
                <div className="p-5 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/20 mb-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Pending Payout</p>
                      <p className="font-display text-2xl text-[var(--accent)]">
                        {formatCents(earnings?.pending_payout || 0)}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">
                        Payouts are processed automatically via Stripe
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* No earnings yet */}
              {!earnings || earnings.total_net === 0 ? (
                <div className="text-center py-12 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <DollarSign size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
                  <h2 className="font-display text-xl mb-2">No earnings yet</h2>
                  <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
                    Create subscription tiers or enable tips on your profile to start earning
                  </p>
                </div>
              ) : null}

              {/* Platform fees info */}
              <div className="mt-8 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} className="text-[var(--text-tertiary)] mt-0.5" />
                  <div className="text-sm text-[var(--text-secondary)]">
                    <p className="font-medium mb-1">Platform fees</p>
                    <p>Neolog takes a 10% platform fee on all transactions. Stripe processing fees (2.9% + 30c) are additional and handled by Stripe.</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  )
}

