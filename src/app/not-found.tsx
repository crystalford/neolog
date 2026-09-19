/**
 * 404. Minimal chrome, no masthead — same vocabulary as /signin and the
 * error boundary below it.
 *
 * ⚠️ This page (and `error.tsx`, `global-error.tsx`, `signin/page.tsx`) sit
 * outside `design/` — there is no design-package page for a 404 or a sign-in
 * screen, so `check-design.mjs` / `check-design-render.mjs` have never
 * measured any of them, and the 9 Sep design-parity pass never touched them.
 * All four were still carrying the OLD, pre-8-Sep vocabulary CLAUDE.md
 * documents as forbidden everywhere else — a giant hero, an uppercase
 * letterspaced eyebrow — and this one's copy still named the deleted
 * product's concepts (a vlog, a thread, a cluster, a production) with a
 * "Back to Timeline" button pointing at a route that no longer exists.
 */

import Link from 'next/link'
import { LogoMark } from '@/components/Shell'

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
        textAlign: 'center', padding: 32,
      }}>
        <h1 style={{
          fontFamily: 'var(--font-body)', fontWeight: 300,
          fontSize: 34, lineHeight: 1.15, letterSpacing: '-0.7px',
          color: 'var(--fg)', margin: '0 0 14px', textWrap: 'balance',
        }}>
          Not here<span style={{ color: 'var(--t-steel)' }}>.</span>
        </h1>
        <p style={{
          fontSize: 14.5, lineHeight: 1.6, color: 'var(--fg-2)',
          maxWidth: 440, marginBottom: 28,
        }}>
          That address doesn&rsquo;t resolve to anything on the log — an
          entry, a page, a recording. Old bookmark, or a link from before a
          route moved.
        </p>
        <Link href="/" className="btn primary">
          Back to the log
          <span className="ico"><svg viewBox="0 0 14 14"><path d="M3 7 L11 7 M8 4 L11 7 L8 10"/></svg></span>
        </Link>
      </main>
    </div>
  )
}
