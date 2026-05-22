/**
 * Canon 404 page. Minimal chrome, no masthead — same vocabulary as
 * /signin and /onboarding. Logo top-left, big "Not here." h1, cobalt
 * accent period, back-to-Timeline CTA.
 */

import Link from 'next/link'

export const runtime = 'edge'

export default function NotFound() {
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
        textAlign: 'center', padding: 32,
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
          textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 22,
          display: 'inline-flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--t-terra)', boxShadow: '0 0 6px rgba(230,99,74,0.6)' }}/>
          404 · the page isn't here
        </div>
        <h1 style={{
          fontFamily: 'var(--font-body)', fontWeight: 300,
          fontSize: 84, lineHeight: 0.94, letterSpacing: '-3.2px',
          color: 'var(--fg)', margin: '0 0 22px', textWrap: 'balance',
        }}>
          Not here<span style={{ color: 'var(--sig)' }}>.</span>
        </h1>
        <p style={{
          fontSize: 16, lineHeight: 1.55, color: 'var(--fg-2)',
          maxWidth: 520, marginBottom: 32,
        }}>
          The URL doesn't resolve to a vlog, thread, cluster, or production. Old bookmark from a
          previous routing? Try heading back to Timeline.
        </p>
        <Link href="/" className="canon-btn primary">
          Back to Timeline
          <span className="ico"><svg viewBox="0 0 14 14"><path d="M3 7 L11 7 M8 4 L11 7 L8 10"/></svg></span>
        </Link>
      </main>
    </div>
  )
}
