'use client'export const runtime = 'edge'


import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { 
  CreditCard, Plus, Loader2, Edit2, Trash2, Check,
  Users, ToggleLeft, ToggleRight
} from 'lucide-react'

type Tier = {
  id: string
  name: string
  description: string | null
  price_cents: number
  benefits: string[] | null
  is_active: boolean
  stripe_price_id: string | null
  subscriber_count?: number
}

export default function TiersPage() {
  const [loading, setLoading] = useState(true)
  const [tiers, setTiers] = useState<Tier[]>([])
  const [stripeEnabled, setStripeEnabled] = useState(false)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadTiers()
  }, [])

  const loadTiers = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login?redirect=/tiers')
      return
    }

    // Check Stripe status
    const statusRes = await fetch('/api/stripe/connect')
    if (statusRes.ok) {
      const status = await statusRes.json()
      setStripeEnabled(status.enabled)
    }

    // Load tiers
    const { data } = await supabase
      .from('subscription_tiers')
      .select('*')
      .eq('creator_id', session.user.id)
      .order('price_cents', { ascending: true })

    if (data) {
      // Get subscriber counts
      const withCounts = await Promise.all(
        data.map(async (tier) => {
          const { count } = await supabase
            .from('paid_subscriptions')
            .select('*', { count: 'exact', head: true })
            .eq('tier_id', tier.id)
            .eq('status', 'active')
          return { ...tier, subscriber_count: count || 0 }
        })
      )
      setTiers(withCounts)
    }

    setLoading(false)
  }

  const toggleTier = async (tierId: string, currentActive: boolean) => {
    await supabase
      .from('subscription_tiers')
      .update({ is_active: !currentActive })
      .eq('id', tierId)

    setTiers(tiers.map(t => 
      t.id === tierId ? { ...t, is_active: !currentActive } : t
    ))
  }

  const deleteTier = async (tierId: string) => {
    if (!confirm('Delete this tier? Existing subscribers will keep their access until their subscription ends.')) return

    await supabase
      .from('subscription_tiers')
      .delete()
      .eq('id', tierId)

    setTiers(tiers.filter(t => t.id !== tierId))
  }

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`

  return (
    <main className="px-6 lg:px-12 py-10 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-display text-3xl mb-2">Subscription Tiers</h1>
              <p className="text-[var(--text-secondary)]">
                Create paid subscription tiers for your readers
              </p>
            </div>
            <Link href="/tiers/new" className="btn btn-primary">
                <Plus size={16} />
                New Tier
            </Link>
          </div>

      {!stripeEnabled && (
        <div className="mb-8 p-4 rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/20">
          <p className="text-sm">
            <strong>Connect Stripe first.</strong> You need to{' '}
            <Link href="/dashboard/earnings" className="text-[var(--accent)] underline">set up Stripe</Link>
            {' '}before you can accept payments.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : tiers.length === 0 ? (
        <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <CreditCard size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
          <h2 className="font-display text-xl mb-2">No subscription tiers yet</h2>
          <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
            Create tiers to offer paid subscriptions to your readers
          </p>
          <Link href="/tiers/new" className="btn btn-primary">
            <Plus size={16} />
            Create Your First Tier
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {tiers.map(tier => (
            <div
              key={tier.id}
              className={`p-6 rounded-xl bg-[var(--bg-secondary)] border transition-colors ${
                tier.is_active ? 'border-[var(--border-light)]' : 'border-dashed border-[var(--border-medium)] opacity-60'
              }`}
            >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-lg">{tier.name}</h3>
                        {!tier.is_active && (
                          <span className="px-2 py-0.5 text-xs rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-2xl font-display text-[var(--accent)]">
                        {formatPrice(tier.price_cents)}
                        <span className="text-sm text-[var(--text-tertiary)] font-normal">/month</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleTier(tier.id, tier.is_active)}
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                        title={tier.is_active ? 'Deactivate' : 'Activate'}
                        aria-label={tier.is_active ? 'Deactivate tier' : 'Activate tier'}
                      >
                        {tier.is_active ? (
                          <ToggleRight size={20} className="text-[var(--success)]" />
                        ) : (
                          <ToggleLeft size={20} className="text-[var(--text-tertiary)]" />
                        )}
                      </button>
                      <Link
                        href={`/tiers/${tier.id}`}
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                      >
                        <Edit2 size={16} className="text-[var(--text-tertiary)]" />
                      </Link>
                      <button
                        onClick={() => deleteTier(tier.id)}
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                      >
                        <Trash2 size={16} className="text-[var(--error)]" />
                      </button>
                    </div>
                  </div>

                  {tier.description && (
                    <p className="text-[var(--text-secondary)] mb-4">{tier.description}</p>
                  )}

                  {tier.benefits && tier.benefits.length > 0 && (
                    <ul className="space-y-2 mb-4">
                      {tier.benefits.map((benefit, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <Check size={14} className="text-[var(--success)]" />
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex items-center gap-4 pt-4 border-t border-[var(--border-light)] text-sm text-[var(--text-tertiary)]">
                    <span className="flex items-center gap-1">
                      <Users size={14} />
                      {tier.subscriber_count} subscriber{tier.subscriber_count !== 1 ? 's' : ''}
                    </span>
                    {!tier.stripe_price_id && (
                      <span className="text-[var(--warning)]">
                        Stripe price not synced
                      </span>
                    )}
                  </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}


