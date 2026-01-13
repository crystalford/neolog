'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { UserMinus, Loader2, Check, AlertCircle } from 'lucide-react'

export default function UnsubscribePage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUnsubscribe = async () => {
    if (!token) {
      setError('Invalid unsubscribe link')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/subscribe/confirm?token=${token}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setSuccess(true)
      } else {
        setError('Failed to unsubscribe. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }

    setLoading(false)
  }

  if (!token) {
    return (
      <>
        <Header />
        <main className="pt-16 pb-16">
          <div className="max-w-md mx-auto px-6 pt-20 text-center">
            <AlertCircle size={48} className="mx-auto mb-4 text-[var(--error)]" />
            <h1 className="font-display text-2xl mb-2">Invalid Link</h1>
            <p className="text-[var(--text-secondary)] mb-6">
              This unsubscribe link is invalid or has expired.
            </p>
            <Link href="/" className="btn btn-secondary">
              Go Home
            </Link>
          </div>
        </main>
      </>
    )
  }

  if (success) {
    return (
      <>
        <Header />
        <main className="pt-16 pb-16">
          <div className="max-w-md mx-auto px-6 pt-20 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--success)]/10 flex items-center justify-center mx-auto mb-6">
              <Check size={32} className="text-[var(--success)]" />
            </div>
            <h1 className="font-display text-2xl mb-2">Unsubscribed</h1>
            <p className="text-[var(--text-secondary)] mb-6">
              You've been unsubscribed and won't receive any more emails.
            </p>
            <Link href="/" className="btn btn-secondary">
              Go Home
            </Link>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-md mx-auto px-6 pt-20 text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center mx-auto mb-6">
            <UserMinus size={32} className="text-[var(--text-tertiary)]" />
          </div>
          <h1 className="font-display text-2xl mb-2">Unsubscribe</h1>
          <p className="text-[var(--text-secondary)] mb-6">
            Click the button below to unsubscribe from email updates.
          </p>
          
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-[var(--error)]/10 border border-[var(--error)]/20">
              <p className="text-sm text-[var(--error)]">{error}</p>
            </div>
          )}
          
          <button
            onClick={handleUnsubscribe}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Processing...
              </>
            ) : (
              'Unsubscribe'
            )}
          </button>
        </div>
      </main>
    </>
  )
}
