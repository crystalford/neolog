'use client'

/**
 * About — Phase 9 stub.
 *
 * Per /tmp/neolognextlevel/design-reference/00-Sitemap.html, this is the
 * "system, mapped" page: four-principle strip + tiled cards for the
 * primary surfaces. Full rebuild lands in Phase 9. Stub for now so the
 * masthead "About" link doesn't fall through to the [handle] catch-all
 * route and render unstyled.
 */

export const runtime = 'edge'

import Shell from '@/components/Shell'

export default function AboutPage() {
  return (
    <Shell>
      <section style={{ padding: '80px 0' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
          textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 22,
          display: 'inline-flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 6px var(--sig-glow)' }}/>
          The system · mapped
        </div>
        <h1 style={{
          fontFamily: 'var(--font-body)', fontWeight: 300,
          fontSize: 92, lineHeight: 0.94, letterSpacing: '-3.8px',
          color: 'var(--fg)', marginBottom: 28, textWrap: 'balance',
          marginTop: 0,
        }}>
          Make <span style={{ color: 'var(--fg-3)', fontWeight: 300 }}>thinking</span> legible<span style={{ color: 'var(--sig)' }}>.</span>
        </h1>
        <p style={{
          fontSize: 18, lineHeight: 1.55, color: 'var(--fg-1)',
          maxWidth: 660, letterSpacing: '-0.2px', marginBottom: 20,
        }}>
          A personal life graph and production engine. You talk into it —
          raw, unedited. It threads, clusters, and ships in your voice.
        </p>
        <p style={{
          fontSize: 15, color: 'var(--fg-2)', lineHeight: 1.55,
          maxWidth: 660, letterSpacing: '-0.1px',
        }}>
          Full About page coming — four principles, tiled surfaces.
        </p>
      </section>
    </Shell>
  )
}
