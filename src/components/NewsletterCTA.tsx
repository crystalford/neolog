'use client'

import { useState } from 'react'
import { Mail, CheckCircle2, AlertCircle } from 'lucide-react'

interface NewsletterCTAProps {
  authorName: string
  authorId: string
  className?: string
}

export function NewsletterCTA({ authorName, authorId, className = '' }: NewsletterCTAProps) {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, authorId }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to subscribe')
        setLoading(false)
        return
      }

      setSubscribed(true)
      setEmail('')
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (subscribed) {
    return (
      <div className={`p-6 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 ${className}`}>
        <div className="flex items-center gap-3">
          <CheckCircle2 size={24} className="text-green-600" />
          <div>
            <h3 className="font-semibold text-green-900">You're subscribed!</h3>
            <p className="text-sm text-green-700">You'll receive new posts from {authorName}.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`p-6 rounded-xl bg-gradient-to-r from-[var(--accent-soft)] to-[var(--bg-secondary)] border border-[var(--accent)]/20 ${className}`}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
          <Mail size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg mb-1">Enjoying this post?</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Get posts like this delivered straight to your inbox. No spam, just great content from {authorName}.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
              <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="input flex-1"
              autoComplete="email"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary whitespace-nowrap"
            >
              {loading ? 'Subscribing...' : 'Subscribe'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
