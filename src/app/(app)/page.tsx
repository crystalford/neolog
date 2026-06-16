'use client'

/**
 * Home — two halves, no decisions.
 *
 *   TOP — Record / Log something.   Inline CapturePanel (the four-mode
 *                                    uploader) at the top of the page.
 *   BOTTOM — Ready to send.          Up to ~5 production candidates the
 *                                    system has prepared in the background.
 *
 * Unauthed visitors get the public productions landing instead.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { CapturePanel } from '@/components/CapturePanel'

type ReadyItem =
  | {
      kind: 'quote'
      id: string
      quote: string
      take: string | null
      topic: string
      strength: number
      vlog_id: string
      vlog_title: string | null
      transcript_span_start: number | null
      href: string
    }
  | {
      kind: 'clip'
      id: string
      headline: string
      quote: string | null
      vlog_id: string
      vlog_title: string | null
      start_time: number
      end_time: number
      href: string
    }
  | {
      kind: 'subject'
      id: string
      name: string
      framing: string | null
      subject_kind: string | null
      thread_count: number
      vlog_count: number
      href: string
      production_id: string | null
    }
  | {
      kind: 'topic'
      id: string
      title: string
      framing: string | null
      href: string
      production_id: string | null
    }
  | {
      kind: 'quick_video'
      seed: string
      why: string | null
      href: string
    }
  | {
      kind: 'resume'
      id: string
      title: string
      state: string
      production_type: string
      href: string
    }

export default function HomePage() {
  const [authState, setAuthState] = useState<'checking' | 'authed' | 'public'>('checking')
  const [publicProductions, setPublicProductions] = useState<any[]>([])
  const [items, setItems] = useState<ReadyItem[] | null>(null)

  const loadReady = useCallback(async () => {
    try {
      const r = await fetch('/api/v2/home/ready', { credentials: 'include' })
      if (r.status === 401) return null
      const d: any = await r.json()
      setItems(Array.isArray(d?.items) ? d.items : [])
      return true
    } catch {
      setItems([])
      return true
    }
  }, [])

  useEffect(() => {
    (async () => {
      // Probe auth via the ready endpoint. 401 → public mode (productions
      // landing). Anything else → authed home.
      const r = await fetch('/api/v2/home/ready', { credentials: 'include' })
      if (r.status === 401) {
        setAuthState('public')
        const pr = await fetch('/api/p')
        const pd: any = pr.ok ? await pr.json() : { productions: [] }
        setPublicProductions(pd.productions ?? [])
        return
      }
      const d: any = await r.json()
      setItems(Array.isArray(d?.items) ? d.items : [])
      setAuthState('authed')
    })().catch(() => setAuthState('public'))
  }, [])

  if (authState === 'checking') {
    return (
      <Shell>
        <div style={{ padding: 60, color: 'var(--fg-3)' }}>Loading…</div>
      </Shell>
    )
  }

  if (authState === 'public') {
    return <PublicLanding productions={publicProductions}/>
  }

  return (
    <Shell>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 4px' }}>
        {/* TOP — Record / Log something */}
        <section className="canon-reveal d1" style={{ padding: '40px 0 24px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 14,
            display: 'inline-flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 8px var(--sig-glow)' }}/>
            Log something
          </div>
          <h1 style={{
            fontFamily: 'var(--font-body)', fontWeight: 400,
            fontSize: 56, lineHeight: 1.0, letterSpacing: '-2.2px',
            color: 'var(--fg)', margin: '0 0 14px', textWrap: 'balance',
          }}>
            Drop something in<span style={{ color: 'var(--sig)' }}>.</span>
          </h1>
          <p style={{
            fontSize: 16, lineHeight: 1.55, color: 'var(--fg-2)',
            maxWidth: 660, letterSpacing: '-0.15px', margin: '0 0 24px',
          }}>
            Talk into the recorder. Upload a video, audio, or slideshow. The system
            extracts what you said, finds the patterns, and prepares drafts below.
          </p>
          <CapturePanel onUploaded={loadReady}/>
        </section>

        {/* BOTTOM — Ready to send */}
        <section style={{ padding: '32px 0 60px' }}>
          <div className="canon-section-head" style={{ marginBottom: 16 }}>
            <h2>Ready to send</h2>
            <div className="meta">
              {items === null ? '' :
               items.length === 0 ? 'nothing prepared yet' :
               `${items.length} ${items.length === 1 ? 'draft' : 'drafts'}`}
            </div>
          </div>

          {items === null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[0, 1, 2].map(i => (
                <div key={i} className="neolog-skeleton" style={{ height: 96, opacity: 1 - i * 0.25 }}/>
              ))}
            </div>
          )}

          {items !== null && items.length === 0 && <ReadyEmptyState/>}

          {items !== null && items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((it, i) => <ReadyCard key={`${it.kind}-${i}`} item={it}/>)}
            </div>
          )}
        </section>
      </div>
    </Shell>
  )
}

// ─── Ready cards ─────────────────────────────────────────────────────────

function ReadyCard({ item }: { item: ReadyItem }) {
  switch (item.kind) {
    case 'resume':      return <ResumeCard item={item}/>
    case 'quote':       return <QuoteCard item={item}/>
    case 'clip':        return <ClipCard item={item}/>
    case 'subject':     return <SubjectCard item={item}/>
    case 'topic':       return <TopicCard item={item}/>
    case 'quick_video': return <QuickVideoCard item={item}/>
  }
}

function QuoteCard({ item }: { item: Extract<ReadyItem, { kind: 'quote' }> }) {
  return (
    <CardShell
      href={item.href}
      accent="var(--sig)"
      eyebrow={`Your line · strength ${item.strength}`}
      title={`"${item.quote}"`}
      sub={item.topic ? `On ${item.topic}` : null}
      source={item.vlog_title ? `from ${item.vlog_title}` : null}
      action="Open"
    />
  )
}

function ClipCard({ item }: { item: Extract<ReadyItem, { kind: 'clip' }> }) {
  const dur = Math.max(0, Math.round(item.end_time - item.start_time))
  return (
    <CardShell
      href={item.href}
      accent="var(--t-rose)"
      eyebrow={`Clip · ${dur}s delivery moment`}
      title={item.headline}
      sub={item.quote}
      source={item.vlog_title ? `from ${item.vlog_title}` : null}
      action="Review"
    />
  )
}

function CardShell({
  href, accent, eyebrow, title, sub, source, action,
}: {
  href: string
  accent: string
  eyebrow: string
  title: string
  sub?: string | null
  source?: string | null
  action: string
}) {
  return (
    <Link href={href} className="neolog-card-lift" style={{
      display: 'flex', alignItems: 'center', gap: 16,
      textDecoration: 'none', color: 'inherit',
      padding: '16px 20px',
      background: 'var(--bg-1)',
      border: '1px solid var(--line-1)',
      borderLeft: `3px solid ${accent}`,
      borderRadius: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2.2,
          textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 6,
        }}>
          {eyebrow}
        </div>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 500,
          letterSpacing: '-0.3px', color: 'var(--fg)', lineHeight: 1.3,
        }}>
          {title}
        </div>
        {sub && (
          <div style={{ fontSize: 13.5, color: 'var(--fg-2)', marginTop: 6, lineHeight: 1.5 }}>
            {sub}
          </div>
        )}
        {source && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 0.6,
            color: 'var(--fg-4)', marginTop: 8,
          }}>
            {source}
          </div>
        )}
      </div>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.4,
        textTransform: 'uppercase', color: 'var(--fg-3)',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        {action} →
      </span>
    </Link>
  )
}

function ResumeCard({ item }: { item: Extract<ReadyItem, { kind: 'resume' }> }) {
  return (
    <CardShell
      href={item.href}
      accent="var(--sig)"
      eyebrow={`Resume · ${item.production_type.replace(/_/g, ' ')}`}
      title={item.title}
      source={`State: ${item.state.replace(/_/g, ' ')}`}
      action="Pick up"
    />
  )
}

function SubjectCard({ item }: { item: Extract<ReadyItem, { kind: 'subject' }> }) {
  const kindLabel = item.subject_kind === 'tension' ? 'Tension'
    : item.subject_kind === 'evolution' ? 'Evolution'
    : item.subject_kind === 'open_loop' ? 'Open loop'
    : item.subject_kind === 'candidate' ? 'Candidate'
    : 'Subject'
  const accent = item.subject_kind === 'tension' ? 'var(--t-terra)'
    : item.subject_kind === 'evolution' ? 'var(--t-violet)'
    : item.subject_kind === 'open_loop' ? 'var(--t-ochre)'
    : 'var(--t-teal)'
  const source = `${item.thread_count} ${item.thread_count === 1 ? 'moment' : 'moments'} across ${item.vlog_count} ${item.vlog_count === 1 ? 'vlog' : 'vlogs'}`
  return (
    <CardShell
      href={item.href}
      accent={accent}
      eyebrow={`${kindLabel} · from your vlogs`}
      title={item.name}
      sub={item.framing}
      source={source}
      action={item.production_id ? 'Open draft' : 'Make the script'}
    />
  )
}

function TopicCard({ item }: { item: Extract<ReadyItem, { kind: 'topic' }> }) {
  return (
    <CardShell
      href={item.href}
      accent="var(--t-steel)"
      eyebrow="Topic · researched"
      title={item.title}
      sub={item.framing}
      source="Research brief is ready · script not generated"
      action="Review brief"
    />
  )
}

function QuickVideoCard({ item }: { item: Extract<ReadyItem, { kind: 'quick_video' }> }) {
  return (
    <CardShell
      href={item.href}
      accent="var(--t-sage)"
      eyebrow="Quick video · drawn from your profile"
      title={item.seed}
      sub={item.why}
      action="Spin up"
    />
  )
}

function ReadyEmptyState() {
  return (
    <div style={{
      padding: '36px 28px',
      border: '1px dashed var(--line-2)',
      borderRadius: 14, background: 'var(--bg-1)',
      color: 'var(--fg-3)', fontSize: 14, lineHeight: 1.6,
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 2.2,
        textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 10,
      }}>
        Nothing prepared yet
      </div>
      <div style={{ color: 'var(--fg-2)', fontSize: 15, lineHeight: 1.5, maxWidth: 580 }}>
        Drop a vlog above. Once the system has read enough of your recordings, drafts
        will appear here automatically — named subjects, researched topics, quick
        videos drawn from what you already care about.
      </div>
    </div>
  )
}

// ─── Public landing (unauthed) ───────────────────────────────────────────

function PublicLanding({ productions }: { productions: any[] }) {
  return (
    <div className="canon-page">
      <div className="canon-wrap">
        <header style={{
          padding: '22px 0 20px',
          display: 'grid', gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center', gap: 32,
          borderBottom: '1px solid var(--line)',
        }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 11, color: 'var(--fg)', textDecoration: 'none' }}>
            <span style={{ width: 26, height: 26 }}>
              <svg viewBox="0 0 32 32" width="26" height="26" fill="none">
                <path d="M 3 16 Q 9 4, 16 16 T 29 16" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round"/>
                <circle cx="3" cy="16" r="2.4" fill="currentColor"/>
                <circle cx="29" cy="16" r="2.4" fill="currentColor"/>
              </svg>
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 19, letterSpacing: '-0.5px' }}>neolog</span>
          </Link>
          <div/>
          <Link href="/signin" className="canon-btn primary">
            Sign in
            <span className="ico"><svg viewBox="0 0 14 14"><path d="M3 7 L11 7 M8 4 L11 7 L8 10"/></svg></span>
          </Link>
        </header>

        <main className="canon-main">
          <section className="canon-reveal d1" style={{ padding: '72px 0 48px', maxWidth: 860 }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
              textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 22,
              display: 'inline-flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 8px var(--sig-glow)' }}/>
              neolog · published work
            </div>
            <h1 style={{
              fontFamily: 'var(--font-body)', fontWeight: 300,
              fontSize: 92, lineHeight: 0.94, letterSpacing: '-3.8px',
              color: 'var(--fg)', margin: '0 0 28px', textWrap: 'balance',
            }}>
              Everything<span style={{ color: 'var(--fg-3)', fontWeight: 300 }}>,</span> in order<span style={{ color: 'var(--sig)' }}>.</span>
            </h1>
            <p style={{
              fontSize: 18, lineHeight: 1.55, color: 'var(--fg-1)',
              maxWidth: 660, letterSpacing: '-0.2px', marginBottom: 16,
            }}>
              An AI video-essay studio you talk into. The operator records — raw, unedited.
              The system extracts what they said, drafts the next piece in their voice, and
              ships it. What you see below is the public face of the work.
            </p>
            <p style={{ fontSize: 14.5, color: 'var(--fg-2)', lineHeight: 1.55, maxWidth: 660 }}>
              The full archive is private. Sign in if you're the operator.
            </p>
          </section>

          <section style={{ paddingBottom: 64 }}>
            <div className="canon-section-head">
              <h2>Published work</h2>
              <div className="meta">{productions.length} {productions.length === 1 ? 'piece' : 'pieces'}</div>
            </div>

            {productions.length === 0 ? (
              <div style={{
                padding: '48px 32px',
                border: '1px dashed var(--line-2)',
                borderRadius: 14, background: 'var(--bg-1)',
                color: 'var(--fg-3)', fontSize: 14.5, lineHeight: 1.55,
                textAlign: 'center', maxWidth: 640,
              }}>
                Nothing yet. Productions appear here once the operator publishes them.
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 14,
              }}>
                {productions.map((p: any) => (
                  <Link key={p.id} href={`/p/${p.id}`} className="tcard" style={{
                    '--topic': 'var(--sig)',
                    '--topic-soft': 'var(--sig-soft)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  } as any}>
                    <div className="t-header">
                      <span className="topic-pill"><span className="type">{labelForType(p.type)}</span>{p.form && <><span className="sep">·</span>{String(p.form).replace(/_/g, ' ')}</>}</span>
                      <span className="t-time">
                        {new Date(p.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-body)', fontSize: 19, fontWeight: 500,
                      letterSpacing: '-0.3px', lineHeight: 1.3, color: 'var(--fg)',
                    }}>
                      {p.title || '(untitled)'}
                    </div>
                    {p.attribution && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: 0.4 }}>
                        by <b style={{ color: 'var(--fg-1)' }}>{p.attribution}</b>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>

          <footer style={{
            borderTop: '1px solid var(--line)',
            padding: '32px 0 56px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.8,
            textTransform: 'uppercase', color: 'var(--fg-3)', fontWeight: 500,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 6px var(--sig-glow)' }}/>
              neolog
            </span>
            <Link href="/signin" style={{ color: 'inherit', textDecoration: 'none' }}>Sign in</Link>
          </footer>
        </main>
      </div>
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
