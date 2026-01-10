'use client'

import { useState } from 'react'
import { Mail, CheckCircle2 } from 'lucide-react'

interface NewsletterCTAProps {
  authorName: string
  className?: string
}

export function NewsletterCTA({ authorName, className = '' }: NewsletterCTAProps) {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    // TODO: Wire up to actual subscription endpoint
    await new Promise(resolve => setTimeout(resolve, 1000))
    setSubscribed(true)
    setLoading(false)
  }

  if (subscribed) {
    return (
      <div className={`p-6 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 ${className}`}>
        <div className="flex items-center gap-3">
          <CheckCircle2 size={24} className="text-green-600" />
          <div>
            <h3 className="font-semibold text-green-900">You're subscribed!</h3>
            <p className="text-sm text-green-700">Check your inbox for a confirmation email.</p>
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
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 px-4 py-2 rounded-lg border border-[var(--border-light)] bg-white outline-none focus:border-[var(--accent)] transition-colors"
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
