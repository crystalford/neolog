'use client'

/**
 * Published — the accumulating body of work.
 *
 * Only productions in state='published' (or clip_candidates with
 * status='published'). The point of this page is the receipts: "I
 * recorded all those vlogs, and here's what came of them." If this page
 * stays empty, the system isn't doing its job — that's the honest signal.
 *
 * Data: /api/v2/library (existing endpoint, filtered client-side to
 * actually-published rows).
 */

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'

interface Item {
  id: string
  kind: string
  headline: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  state: string
  published_at: string | null
  created_at: string
}

export default function PublishedPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v2/library', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { productions: [] })
      .then((d: any) => {
        const rows = (d.productions ?? []) as Item[]
        // Only show genuinely shipped work — productions in state 'published'
        // and clip_candidates with status 'published'.
        setItems(rows.filter(r => r.state === 'published'))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <Shell>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 4px' }}>
        <section style={{ padding: '48px 0 28px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 14,
          }}>
            Published · the body of work
          </div>
          <h1 style={{
            fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 300, letterSpacing: '-2.5px',
            lineHeight: 1.02, color: 'var(--fg)', margin: 0,
          }}>
            What you actually<br/>shipped.
          </h1>
        </section>

        {loading ? (
          <div style={{ padding: '40px 0', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-4)', letterSpacing: 1 }}>
            LOADING&hellip;
          </div>
        ) : items.length === 0 ? (
          <div style={{
            padding: '48px 28px', textAlign: 'center',
            border: '1px dashed var(--line-2)', borderRadius: 14,
            color: 'var(--fg-3)', fontSize: 14, lineHeight: 1.6,
          }}>
            Nothing published yet. Open a <Link href="/drafts?tab=subjects" style={{ color: 'var(--sig)' }}>subject</Link>,
            make a script or a post, ship it &mdash; it&rsquo;ll show up here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 64 }}>
            {items.map(it => (
              <Link
                key={`${it.kind}/${it.id}`}
                href={it.kind === 'clip' ? `/clip/${it.id}` : `/production/${it.id}`}
                style={{
                  display: 'block', textDecoration: 'none', color: 'inherit',
                  border: '1px solid var(--line-1)', borderRadius: 12,
                  padding: '16px 18px', background: 'var(--bg-1)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.4,
                    textTransform: 'uppercase', color: 'var(--fg-3)',
                  }}>
                    {it.kind.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
                    {it.published_at ? new Date(it.published_at).toLocaleDateString() : '—'}
                  </span>
                  {it.duration_seconds != null && (
                    <span style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
                      {Math.floor(it.duration_seconds / 60)}:{String(Math.floor(it.duration_seconds % 60)).padStart(2, '0')}
                    </span>
                  )}
                </div>
                {it.headline && (
                  <div style={{ fontSize: 15, color: 'var(--fg)', marginTop: 8, lineHeight: 1.45 }}>
                    {it.headline}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}
