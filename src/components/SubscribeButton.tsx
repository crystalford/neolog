'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { UserPlus, UserMinus, Loader2, Check } from 'lucide-react'

interface SubscribeButtonProps {
  creatorId: string
  creatorUsername: string
  initialSubscribed?: boolean
  showCount?: boolean
  initialCount?: number
  size?: 'sm' | 'md' | 'lg'
  variant?: 'primary' | 'secondary' | 'outline'
  className?: string
}

export function SubscribeButton({
  creatorId,
  creatorUsername,
  initialSubscribed = false,
  showCount = false,
  initialCount = 0,
  size = 'md',
  variant = 'primary',
  className = '',
}: SubscribeButtonProps) {
  const [subscribed, setSubscribed] = useState(initialSubscribed)
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [hidden, setHidden] = useState(false)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkSubscription()
  }, [creatorId])

  const checkSubscription = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      setChecking(false)
      return
    }

    // Don't show subscribe button for own profile
    if (session.user.id === creatorId) {
      setHidden(true)
      setChecking(false)
      return
    }

    // Check if already subscribed
    const { data } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('subscriber_id', session.user.id)
      .eq('creator_id', creatorId)
      .single()

    setSubscribed(!!data)

    // Get subscriber count if needed
    if (showCount) {
      const { data: countData } = await supabase
        .rpc('get_subscriber_count', { target_creator_id: creatorId })
      
      if (countData !== null) {
        setCount(countData)
      }
    }

    setChecking(false)
  }

  const handleSubscribe = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      // Redirect to login with return URL
      router.push(`/login?redirect=/${creatorUsername}`)
      return
    }

    setLoading(true)

    if (subscribed) {
      // Unsubscribe
      const { data } = await supabase
        .rpc('unsubscribe_from_creator', {
          p_subscriber_id: session.user.id,
          p_creator_id: creatorId,
        })

      if (data) {
        setSubscribed(false)
        setCount(c => Math.max(0, c - 1))
      }
    } else {
      // Subscribe - check for referral code in URL
      const urlParams = new URLSearchParams(window.location.search)
      const refCode = urlParams.get('ref')

      const { data } = await supabase
        .rpc('subscribe_to_creator', {
          p_subscriber_id: session.user.id,
          p_creator_id: creatorId,
          p_referral_code: refCode,
        })

      if (data) {
        setSubscribed(true)
        setCount(c => c + 1)
      }
    }

    setLoading(false)
  }

  if (hidden) {
    return null
  }

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-base gap-2',
  }

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 18,
  }

  const baseClasses = `
    inline-flex items-center justify-center font-medium rounded-lg transition-all
    disabled:opacity-50 disabled:cursor-not-allowed
    ${sizeClasses[size]}
  `

  const variantClasses = subscribed
    ? 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)] hover:border-[var(--error)] hover:text-[var(--error)] hover:bg-[var(--error)]/5'
    : variant === 'primary'
    ? 'bg-[var(--accent)] text-white hover:opacity-90'
    : variant === 'secondary'
    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-light)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
    : 'border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white'

  return (
    <button
      onClick={handleSubscribe}
      disabled={loading || checking}
      className={`${baseClasses} ${variantClasses} subscribe-btn ${className}`}
    >
      {loading || checking ? (
        <Loader2 size={iconSizes[size]} className="animate-spin" />
      ) : subscribed ? (
        <>
          <Check size={iconSizes[size]} />
          <span>Subscribed</span>
        </>
      ) : (
        <>
          <UserPlus size={iconSizes[size]} />
          <span>Subscribe</span>
        </>
      )}
      {showCount && count > 0 && (
        <span className="ml-1 opacity-70">
          ({count.toLocaleString()})
        </span>
      )}
    </button>
  )
}

// Compact version for cards
export function SubscribeButtonCompact({
  creatorId,
  creatorUsername,
}: {
  creatorId: string
  creatorUsername: string
}) {
  return (
    <SubscribeButton
      creatorId={creatorId}
      creatorUsername={creatorUsername}
      size="sm"
      variant="outline"
    />
  )
}
