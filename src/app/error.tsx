'use client'

/**
 * Error boundary. Same minimal chrome as 404 — see that file's header for
 * why neither of these had ever been measured against the design system
 * until now. Shows the error message + a Reset button (Next.js calls
 * `reset()` to retry the render) + a way back to the log.
 */

export const runtime = 'edge'

import { useEffect } from 'react'
import Link from 'next/link'
import { LogoMark } from '@/components/Shell'

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
        display: 'flex', alignItems: 'center',
        maxWidth: 1280, margin: '0 auto', width: '100%',
      }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--fg)', textDecoration: 'none' }}>
          <LogoMark size={20} />
          <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.4px' }}>neolog</span>
        </Link>
      </header>
      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: 32, maxWidth: 640, margin: '0 auto',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-body)', fontWeight: 300,
          fontSize: 32, lineHeight: 1.15, letterSpacing: '-0.6px',
          color: 'var(--fg)', margin: '0 0 14px', textWrap: 'balance',
        }}>
          Something broke<span style={{ color: 'var(--t-terra)' }}>.</span>
        </h1>
        <p style={{
          fontSize: 14.5, lineHeight: 1.6, color: 'var(--fg-2)',
          maxWidth: 460, marginBottom: 16,
        }}>
          The page hit an error rendering. Reset usually clears it — if it
          keeps coming back, the message below points at what&rsquo;s wrong.
        </p>
        <div style={{
          padding: '12px 16px',
          background: 'rgba(230,99,74,0.06)',
          border: '1px solid var(--t-terra)',
          borderRadius: 8,
          fontFamily: 'var(--font-mono)', fontSize: 11.5,
          color: 'var(--fg-1)', letterSpacing: 0.2,
          textAlign: 'left', maxWidth: 520,
          marginBottom: 24, wordBreak: 'break-word',
        }}>
          {error.message || String(error)}
          {error.digest && (
            <div style={{ marginTop: 8, color: 'var(--fg-4)', fontSize: 10.5 }}>
              digest: {error.digest}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => reset()} className="btn primary">
            Reset
          </button>
          <Link href="/" className="btn">
            Back to the log
          </Link>
        </div>
      </main>
    </div>
  )
}
