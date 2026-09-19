'use client'

/**
 * Fires only when the ROOT layout itself throws — Next.js requires this
 * file to supply its own complete `<html><body>`, so it does not inherit
 * `layout.tsx`'s `import './globals.css'` for free.
 *
 * ⚠️ It never had one of its own either. What shipped instead was a warm
 * cream background, a serif display face, and a terracotta button — none
 * of it neolog's actual tokens, none of it the wordmark, generic
 * "Critical Error" copy. On the one screen a total layout failure shows,
 * the product looked like a different app entirely. Importing `globals.css`
 * here (the officially supported way to style this file) is what
 * `error.tsx` gets automatically and this file needs explicitly.
 */

import './globals.css'
import { LogoMark } from '@/components/Shell'

export default function GlobalError({
  error, reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--fg)' }}>
            <LogoMark size={20} />
            <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.4px' }}>neolog</span>
          </span>
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
            Something broke badly<span style={{ color: 'var(--t-terra)' }}>.</span>
          </h1>
          <p style={{
            fontSize: 14.5, lineHeight: 1.6, color: 'var(--fg-2)',
            maxWidth: 460, marginBottom: 16,
          }}>
            The whole page failed to render, not just one part of it. Reset
            usually clears it — if it keeps coming back, the message below
            points at what&rsquo;s wrong.
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
          <button onClick={() => reset()} className="btn primary">
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
