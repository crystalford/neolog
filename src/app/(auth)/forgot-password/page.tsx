'use client'

export const runtime = 'edge'


import { useState } from 'react'
import Link from 'next/link'
import { Mail, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (resetError) {
        setError(resetError.message)
      } else {
        setSent(true)
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-up">
      <div className="text-center mb-10">
        <h1 className="font-display text-3xl mb-2">Reset your password</h1>
        <p className="text-[var(--text-secondary)]">
          We will email you a secure reset link.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3">
          <AlertCircle size={18} className="text-[var(--error)] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-[var(--error)]">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-sm text-[var(--error)] underline mt-1 hover:no-underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {sent ? (
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--success)]/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={28} className="text-[var(--success)]" />
          </div>
          <p className="text-[var(--text-secondary)]">
            If an account exists for <strong className="text-[var(--text-primary)]">{email}</strong>,
            we sent a reset link.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Email
            </label>
            <div className="relative">
              <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input input-with-icon"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full py-3"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-[var(--text-secondary)]">
        Remembered your password?{' '}
        <Link href="/login" className="text-[var(--accent)] hover:underline font-medium">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
