'use client'

export const runtime = 'edge'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error to console in development
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-2xl bg-[var(--error)]/10 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle size={40} className="text-[var(--error)]" />
        </div>
        
        <h1 className="font-display text-4xl mb-3">Something went wrong</h1>
        <p className="text-[var(--text-secondary)] mb-8">
          An unexpected error occurred. Our team has been notified.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button onClick={reset} className="btn btn-primary w-full sm:w-auto">
            <RefreshCw size={16} />
            Try Again
          </button>
          <a href="/" className="btn btn-secondary w-full sm:w-auto">
            <Home size={16} />
            Go Home
          </a>
        </div>

        {error.digest && (
          <p className="mt-8 text-xs text-[var(--text-tertiary)]">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
