'use client'

import { useState } from 'react'
import { Mail, Loader2, Check, AlertCircle } from 'lucide-react'

interface EmailSubscribeFormProps {
  creatorId: string
  creatorName: string
  publicationId?: string | null
  className?: string
  variant?: 'inline' | 'card'
}

export function EmailSubscribeForm({
  creatorId,
  creatorName,
  publicationId,
  className = '',
  variant = 'inline',
}: EmailSubscribeFormProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          creatorId,
          publicationId: publicationId || undefined,
          source: 'website',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 409) {
          setError('This email is already subscribed')
        } else {
          setError(data.error || 'Something went wrong. Please try again.')
        }
        setLoading(false)
        return
      }

      setSuccess(true)
    } catch {
      setError('Something went wrong. Please try again.')
    }

    setLoading(false)
  }

  if (success) {
    return (
      <div className={`flex items-center gap-3 p-4 rounded-xl bg-[var(--success)]/10 border border-[var(--success)]/20 ${className}`}>
        <Check size={20} className="text-[var(--success)]" />
        <div>
          <p className="font-medium text-[var(--success)]">Check your inbox!</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Click the link in the email to confirm your subscription.
          </p>
        </div>
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className={`p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] ${className}`}>
        <h3 className="font-display text-lg mb-2">Subscribe to {creatorName}</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Get new posts delivered to your inbox
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="input pl-10"
              disabled={loading}
            />
          </div>
          
          {error && (
            <div className="flex items-center gap-2 text-sm text-[var(--error)]">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Subscribing...
              </>
            ) : (
              'Subscribe'
            )}
          </button>
        </form>
        
        <p className="text-xs text-[var(--text-tertiary)] mt-3 text-center">
          No spam. Unsubscribe anytime.
        </p>
      </div>
    )
  }

  // Inline variant
  return (
    <form onSubmit={handleSubmit} className={`flex gap-2 ${className}`}>
      <div className="relative flex-1">
        <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError(null)
          }}
          placeholder="your@email.com"
          className="input pl-9 py-2 text-sm"
          disabled={loading}
        />
      </div>
      
      <button
        type="submit"
        disabled={loading}
        className="btn btn-primary btn-sm"
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          'Subscribe'
        )}
      </button>
      
      {error && (
        <span className="absolute -bottom-5 left-0 text-xs text-[var(--error)]">
          {error}
        </span>
      )}
    </form>
  )
}
