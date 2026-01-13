'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Lock, Loader2, Check } from 'lucide-react'

interface PaywallProps {
  postId: string
  authorId: string
  authorUsername: string
  authorName: string
  previewContent?: string | null
}

type Tier = {
  id: string
  name: string
  description: string | null
  price_cents: number
  benefits: string[] | null
}

export function Paywall({ postId, authorId, authorUsername, authorName, previewContent }: PaywallProps) {
  const [loading, setLoading] = useState(true)
  const [tiers, setTiers] = useState<Tier[]>([])
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadTiers()
  }, [])

  const loadTiers = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    setIsLoggedIn(!!session)

    const { data } = await supabase
      .from('subscription_tiers')
      .select('*')
      .eq('creator_id', authorId)
      .eq('is_active', true)
      .order('price_cents', { ascending: true })

    if (data) setTiers(data)
    setLoading(false)
  }

  const handleSubscribe = async (tierId: string) => {
    if (!isLoggedIn) {
      router.push(`/login?redirect=/${authorUsername}`)
      return
    }

    setSubscribing(tierId)

    const res = await fetch('/api/stripe/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tierId, creatorId: authorId }),
    })

    if (res.ok) {
      const { url } = await res.json()
      window.location.href = url
    } else {
      alert('Failed to start checkout')
      setSubscribing(null)
    }
  }

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`

  return (
    <div className="my-8">
      {/* Preview content */}
      {previewContent && (
        <div 
          className="prose mb-8 relative"
          dangerouslySetInnerHTML={{ __html: previewContent }}
        />
      )}

      {/* Gradient fade */}
      <div className="h-32 bg-gradient-to-t from-[var(--bg-primary)] to-transparent -mt-32 relative z-10" />

      {/* Paywall */}
      <div className="relative z-20 p-8 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] text-center">
        <div className="w-14 h-14 rounded-full bg-[var(--accent-soft)] flex items-center justify-center mx-auto mb-4">
          <Lock size={24} className="text-[var(--accent)]" />
        </div>

        <h2 className="font-display text-2xl mb-2">
          This is a premium post
        </h2>
        <p className="text-[var(--text-secondary)] mb-6">
          Subscribe to {authorName} to read the full article
        </p>

        {loading ? (
          <Loader2 size={24} className="animate-spin mx-auto text-[var(--text-tertiary)]" />
        ) : tiers.length === 0 ? (
          <p className="text-[var(--text-tertiary)]">
            No subscription tiers available yet
          </p>
        ) : (
          <div className="grid gap-4 max-w-md mx-auto">
            {tiers.map(tier => (
              <div
                key={tier.id}
                className="p-5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-light)] text-left"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium">{tier.name}</h3>
                    <p className="text-xl font-display text-[var(--accent)]">
                      {formatPrice(tier.price_cents)}
                      <span className="text-sm text-[var(--text-tertiary)] font-normal">/month</span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleSubscribe(tier.id)}
                    disabled={subscribing === tier.id}
                    className="btn btn-primary btn-sm"
                  >
                    {subscribing === tier.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      'Subscribe'
                    )}
                  </button>
                </div>

                {tier.benefits && tier.benefits.length > 0 && (
                  <ul className="space-y-1">
                    {tier.benefits.slice(0, 3).map((benefit, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <Check size={12} className="text-[var(--success)]" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {!isLoggedIn && (
          <p className="text-sm text-[var(--text-tertiary)] mt-4">
            Already a subscriber?{' '}
            <Link href={`/login?redirect=/${authorUsername}`} className="text-[var(--accent)] hover:underline">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
