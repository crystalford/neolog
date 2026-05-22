'use client'

/**
 * Canon error boundary. Same minimal chrome as 404. Shows the error
 * message + a Reset button (Next.js calls `reset()` to retry the
 * render) + a back-to-Timeline link.
 */

export const runtime = 'edge'

import { useEffect } from 'react'
import Link from 'next/link'

export default function ErrorBoundary({
  error, reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error)
  }, [error])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--fg)',
      fontFamily: 'var(--font-body)',
      display: 'flex', flexDirection: 'column',
    }}>
      <header style={{
        padding: '24px 56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--line)',
        maxWidth: 1280, margin: '0 auto', width: '100%',
      }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 11, color: 'var(--fg)', textDecoration: 'none' }}>
          <svg viewBox="0 0 32 32" width={22} height={22} fill="none">
            <path d="M 3 16 Q 9 4, 16 16 T 29 16" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round"/>
            <circle cx="3" cy="16" r="2.4" fill="currentColor"/>
            <circle cx="29" cy="16" r="2.4" fill="currentColor"/>
          </svg>
          <span style={{ fontSize: 19, fontWeight: 500, letterSpacing: '-0.5px' }}>neolog</span>
        </Link>
      </header>
      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: 32, maxWidth: 720, margin: '0 auto',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
          textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 22,
          display: 'inline-flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--t-terra)', boxShadow: '0 0 6px rgba(230,99,74,0.6)' }}/>
          Something broke
        </div>
        <h1 style={{
          fontFamily: 'var(--font-body)', fontWeight: 300,
          fontSize: 76, lineHeight: 0.94, letterSpacing: '-2.8px',
          color: 'var(--fg)', margin: '0 0 22px', textWrap: 'balance',
        }}>
          Snag<span style={{ color: 'var(--t-terra)' }}>.</span>
        </h1>
        <p style={{
          fontSize: 16, lineHeight: 1.55, color: 'var(--fg-2)',
          maxWidth: 520, marginBottom: 18,
        }}>
          The page hit an error rendering. Reset usually clears it — if it keeps coming back, the
          message below points at what's wrong.
        </p>
        <div style={{
          padding: '12px 18px',
          background: 'rgba(230,99,74,0.06)',
          border: '1px solid var(--t-terra)',
          borderRadius: 8,
          fontFamily: 'var(--font-mono)', fontSize: 11.5,
          color: 'var(--fg-1)', letterSpacing: 0.2,
          textAlign: 'left', maxWidth: 560,
          marginBottom: 28, wordBreak: 'break-word',
        }}>
          {error.message || String(error)}
          {error.digest && (
            <div style={{ marginTop: 8, color: 'var(--fg-4)', fontSize: 10.5 }}>
              digest: {error.digest}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => reset()} className="canon-btn primary">
            Reset
          </button>
          <Link href="/" className="canon-btn ghost">
            Back to Timeline
          </Link>
        </div>
      </main>
    </div>
  )
}
