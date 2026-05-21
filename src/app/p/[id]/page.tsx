/**
 * Public production view — neolog.ai/p/[id]
 *
 * Auth-free. Renders a production where visibility='public'. Reads
 * via /api/p/[id]. 404 fallback when the id doesn't exist or isn't
 * public.
 *
 * Chrome is intentionally lightweight — neolog mark + attribution +
 * the production content. No sidebar, no operator controls, no
 * pipeline view. The public face is a publication, not the working
 * panel.
 */

'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/Logo'

interface PublicProduction {
  id: string
  type: string
  state: string
  form: string | null
  length: string | null
  title: string | null
  attribution: string | null
  body: string
  published_to: string | null
  engagement: any
  produced_at: string | null
  created_at: string
}

export default function PublicProductionPage({ params }: { params: { id: string } }) {
  const [p, setP] = useState<PublicProduction | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/p/${params.id}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: any) => { if (d?.production) setP(d.production) })
      .catch(e => setError(String(e?.message || e)))
  }, [params.id])

  if (notFound) return <PublicShell><NotFound/></PublicShell>
  if (error) return <PublicShell><div style={{ color: 'var(--err)' }}>Error: {error}</div></PublicShell>
  if (!p) return <PublicShell><div style={{ color: 'var(--fg-3)' }}>Loading…</div></PublicShell>

  const dateStr = p.produced_at
    ? new Date(p.produced_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date(p.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <PublicShell>
      <article style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Eyebrow: type + form */}
        <div style={{
          fontSize: 10, color: 'var(--fg-3)', letterSpacing: 1.4, textTransform: 'uppercase',
          fontFamily: 'Geist Mono, ui-monospace, monospace', marginBottom: 16, fontWeight: 600,
        }}>
          {labelForType(p.type)} {p.form && <span style={{ color: 'var(--fg-4)' }}>· {p.form.replace(/_/g, ' ')}</span>}
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 48, fontWeight: 500, letterSpacing: '-1.4px', lineHeight: 1.1,
          margin: '0 0 22px', color: 'var(--fg)',
        }}>
          {p.title ?? 'Untitled'}
        </h1>

        {/* Attribution row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          fontSize: 12, color: 'var(--fg-3)',
          fontFamily: 'Geist Mono, ui-monospace, monospace', letterSpacing: 0.3,
          marginBottom: 48,
          paddingBottom: 18,
          borderBottom: '1px solid var(--line)',
        }}>
          <span>by <b style={{ color: 'var(--fg-1)', fontFamily: 'inherit' }}>{p.attribution}</b></span>
          <span style={{ color: 'var(--fg-5)' }}>·</span>
          <span>{dateStr}</span>
          {p.engagement && (
            <>
              <span style={{ color: 'var(--fg-5)' }}>·</span>
              {p.engagement.views != null && <span><b style={{ color: 'var(--fg-1)', fontFamily: 'inherit' }}>{p.engagement.views.toLocaleString()}</b> views</span>}
            </>
          )}
        </div>

        {/* Body */}
        <div style={{
          fontSize: 17, color: 'var(--fg-1)', lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          fontFamily: 'Geist, system-ui, sans-serif',
        }}>
          {p.body || <em style={{ color: 'var(--fg-3)' }}>(no body yet)</em>}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 64, paddingTop: 24, borderTop: '1px solid var(--line)',
          fontSize: 11, color: 'var(--fg-4)',
          fontFamily: 'Geist Mono, ui-monospace, monospace', letterSpacing: 0.4,
          textTransform: 'uppercase',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>neolog · {p.id.slice(0, 16)}…</span>
          <Link href="/" style={{ color: 'var(--fg-3)', textDecoration: 'none' }}>← back to neolog</Link>
        </div>
      </article>
    </PublicShell>
  )
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg-1)' }}>
      {/* Masthead — light, like a magazine cover */}
      <header style={{
        padding: '22px 36px',
        borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        maxWidth: 1320, margin: '0 auto',
      }}>
        <Link href="/" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          textDecoration: 'none', color: 'var(--fg)',
        }}>
          <Logo size={22}/>
          <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.4px' }}>neolog</span>
        </Link>
        <div style={{
          fontSize: 10, color: 'var(--fg-4)', letterSpacing: 1.2,
          textTransform: 'uppercase',
          fontFamily: 'Geist Mono, ui-monospace, monospace',
        }}>
          Published work
        </div>
      </header>
      <main style={{ padding: '64px 36px 80px' }}>
        {children}
      </main>
    </div>
  )
}

function NotFound() {
  return (
    <div style={{ maxWidth: 540, margin: '0 auto', textAlign: 'center', padding: '60px 0' }}>
      <h1 style={{ fontSize: 36, fontWeight: 500, letterSpacing: '-0.8px', margin: '0 0 16px' }}>
        Not published
      </h1>
      <p style={{ fontSize: 15, color: 'var(--fg-3)', lineHeight: 1.55, marginBottom: 28 }}>
        This piece isn't public — either it doesn't exist or the operator hasn't published it yet.
      </p>
      <Link href="/" style={{
        display: 'inline-block', padding: '10px 18px',
        background: 'var(--bg-1)', color: 'var(--fg-1)',
        border: '1px solid var(--line)', borderRadius: 6,
        textDecoration: 'none', fontSize: 13,
      }}>← back to neolog</Link>
    </div>
  )
}

function labelForType(t: string): string {
  return ({
    video_essay: 'Video essay',
    article: 'Article',
    x_post: 'Post',
    x_thread: 'Thread',
    clip: 'Clip',
    creative_work: 'Creative',
  } as Record<string, string>)[t] || t.replace(/_/g, ' ')
}
