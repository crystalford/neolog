/**
 * Landing-page "Published work" section.
 *
 * Client island that fetches /api/p (public productions list) and
 * renders a small editorial grid. Empty state when nothing is public.
 *
 * Lives outside the (app) shell — same lightweight Geist/mono chrome
 * as the rest of the landing page.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface PublicProductionRow {
  id: string
  type: string
  form: string | null
  title: string
  attribution: string
  published_at: string
}

export function PublishedWork() {
  const [rows, setRows] = useState<PublicProductionRow[] | null>(null)

  useEffect(() => {
    fetch('/api/p')
      .then(r => r.ok ? r.json() : { productions: [] })
      .then((d: any) => setRows(d.productions ?? []))
      .catch(() => setRows([]))
  }, [])

  return (
    <section style={{ maxWidth: 1320, margin: '0 auto', padding: '70px 48px', borderTop: '1px solid var(--line)' }}>
      <div style={{
        fontSize: 11, letterSpacing: 0.5, color: 'var(--fg-3)',
        textTransform: 'uppercase', marginBottom: 14,
        fontFamily: 'Geist Mono, ui-monospace, monospace',
      }}>
        Published work
      </div>
      <h2 style={{
        fontSize: 36, fontWeight: 500, letterSpacing: '-0.9px',
        marginBottom: 36, marginTop: 0, maxWidth: 720,
      }}>
        What the graph has shipped{' '}
        <span style={{ color: 'var(--accent)' }}>so far.</span>
      </h2>

      {rows === null && (
        <div style={{ color: 'var(--fg-3)', fontSize: 14 }}>Loading…</div>
      )}

      {rows && rows.length === 0 && (
        <div style={{
          padding: '36px 28px',
          background: 'var(--bg-1)',
          border: '1px dashed var(--line)',
          borderRadius: 10,
          color: 'var(--fg-3)',
          fontSize: 14,
          lineHeight: 1.55,
          maxWidth: 640,
        }}>
          Nothing yet. Productions appear here once the operator publishes them —
          essays, articles, threads, clips. Stay tuned.
        </div>
      )}

      {rows && rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {rows.map(r => (
            <Link
              key={r.id}
              href={`/p/${r.id}`}
              style={{
                display: 'block',
                padding: 22,
                background: 'var(--bg-1)',
                border: '1px solid var(--line)',
                borderRadius: 10,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{
                fontSize: 10, color: 'var(--fg-3)', letterSpacing: 1.2,
                textTransform: 'uppercase', marginBottom: 12,
                fontFamily: 'Geist Mono, ui-monospace, monospace', fontWeight: 600,
              }}>
                {labelForType(r.type)}{r.form && <span style={{ color: 'var(--fg-4)' }}> · {r.form.replace(/_/g, ' ')}</span>}
              </div>
              <div style={{
                fontSize: 19, fontWeight: 500, color: 'var(--fg)',
                letterSpacing: '-0.3px', lineHeight: 1.3, marginBottom: 14,
              }}>
                {r.title}
              </div>
              <div style={{
                fontSize: 11, color: 'var(--fg-3)',
                fontFamily: 'Geist Mono, ui-monospace, monospace',
                letterSpacing: 0.3, display: 'flex', gap: 10,
              }}>
                <span>by <b style={{ color: 'var(--fg-1)' }}>{r.attribution}</b></span>
                <span style={{ color: 'var(--fg-5)' }}>·</span>
                <span>{new Date(r.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
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
