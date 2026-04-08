'use client'

export const runtime = 'edge'

import Link from 'next/link'
import { FileQuestion, Home, Search, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-2xl bg-[var(--bg-secondary)] flex items-center justify-center mx-auto mb-6">
          <FileQuestion size={40} className="text-[var(--text-tertiary)]" />
        </div>
        
        <h1 className="font-display text-4xl mb-3">Page not found</h1>
        <p className="text-[var(--text-secondary)] mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/" className="btn btn-primary w-full sm:w-auto">
            <Home size={16} />
            Go Home
          </Link>
        </div>

        <button 
          onClick={() => window.history.back()}
          className="mt-6 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 transition-colors"
        >
          <ArrowLeft size={14} />
          Go back
        </button>
      </div>
    </div>
  )
}
