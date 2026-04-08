'use client'export const runtime = 'edge'


import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Lock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const setSessionFromUrl = async () => {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            setError(exchangeError.message)
          }
        } else if (url.hash) {
          const hashParams = new URLSearchParams(url.hash.replace('#', ''))
          const accessToken = hashParams.get('access_token')
          const refreshToken = hashParams.get('refresh_token')
          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
            if (sessionError) {
              setError(sessionError.message)
            }
          }
        }
      } catch (err) {
        setError('Invalid or expired reset link.')
      } finally {
        setReady(true)
      }
    }

    setSessionFromUrl()
  }, [supabase.auth])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
      } else {
        setSuccess(true)
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
        <h1 className="font-display text-3xl mb-2">Set a new password</h1>
        <p className="text-[var(--text-secondary)]">Choose a strong password you will remember.</p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3">
          <AlertCircle size={18} className="text-[var(--error)] flex-shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--error)]">{error}</p>
        </div>
      )}

      {!ready ? (
        <div className="flex items-center justify-center py-10 text-[var(--text-secondary)]">
          <Loader2 size={20} className="animate-spin mr-2" />
          Verifying reset link...
        </div>
      ) : success ? (
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--success)]/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={28} className="text-[var(--success)]" />
          </div>
          <p className="text-[var(--text-secondary)] mb-4">Your password has been updated.</p>
          <Link href="/login" className="btn btn-primary">
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              New password
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                className="input input-with-icon"
                required
                minLength={8}
              />
            </div>
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Confirm password
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm password"
                className="input input-with-icon"
                required
                minLength={8}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full py-3"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Update password'}
          </button>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-[var(--text-secondary)]">
        Need help?{' '}
        <Link href="/login" className="text-[var(--accent)] hover:underline font-medium">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
