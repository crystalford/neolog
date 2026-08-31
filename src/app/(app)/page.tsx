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

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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

interface AutoShippedRecent {
  id: string
  produced_at: string
  headline: string | null
  vlog_id: string | null
}

interface LogEntry { id: string; text: string; occurred_at: string; created_at: string }

export default function HomePage() {
  const [authState, setAuthState] = useState<'checking' | 'authed' | 'public'>('checking')
  const [publicProductions, setPublicProductions] = useState<any[]>([])
  const [items, setItems] = useState<ReadyItem[] | null>(null)
  const [autoShipped, setAutoShipped] = useState<AutoShippedRecent[]>([])
  const [feed, setFeed] = useState<LogEntry[] | null>(null)
  const [composeText, setComposeText] = useState('')
  const [composeDate, setComposeDate] = useState('')
  const [posting, setPosting] = useState(false)
  const composeRef = useRef<HTMLTextAreaElement | null>(null)

  const loadFeed = useCallback(async () => {
    try {
      const r = await fetch('/api/v2/log-entries?limit=50', { credentials: 'include' })
      if (!r.ok) { setFeed([]); return }
      const d: any = await r.json()
      setFeed(Array.isArray(d?.entries) ? d.entries : [])
    } catch { setFeed([]) }
  }, [])

  const postEntry = async () => {
    const text = composeText.trim()
    if (!text || posting) return
    setPosting(true)
    try {
      const r = await fetch('/api/v2/log-entries', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          ...(composeDate ? { occurred_at: new Date(composeDate + 'T12:00:00').toISOString() } : {}),
        }),
      })
      if (!r.ok) { const d: any = await r.json().catch(() => ({})); throw new Error(d?.error || `HTTP ${r.status}`) }
      setComposeText(''); setComposeDate('')
      if (composeRef.current) composeRef.current.style.height = 'auto'
      loadFeed()
    } catch {
      // Inline error would need its own slot; keep this cheap and just leave
      // the text in the box so nothing typed is lost on failure.
    } finally { setPosting(false) }
  }

  const loadReady = useCallback(async () => {
    try {
      const r = await fetch('/api/v2/home/ready', { credentials: 'include' })
      if (r.status === 401) return null
      const d: any = await r.json()
      setItems(Array.isArray(d?.items) ? d.items : [])
      setAutoShipped(Array.isArray(d?.auto_shipped_recent) ? d.auto_shipped_recent : [])
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
      setAutoShipped(Array.isArray(d?.auto_shipped_recent) ? d.auto_shipped_recent : [])
      setAuthState('authed')
      loadFeed()
    })().catch(() => setAuthState('public'))
  }, [loadFeed])

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
        {autoShipped.length > 0 && <AutoShippedRibbon items={autoShipped}/>}

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
            Type it, talk into the recorder, or upload a video, audio, or slideshow.
            The system extracts what you said, finds the patterns, and prepares drafts below.
          </p>

          {/* The cheapest door: a sentence and a date, nothing else
              required. Backdate it for anything that already happened.
              Starts one line tall for a quick update, grows as you write —
              same box works for "got a job" and for an actual chapter. */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            padding: '10px 12px', marginBottom: 14,
            background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 10,
          }}>
            <textarea
              ref={composeRef}
              value={composeText}
              onChange={e => {
                setComposeText(e.target.value)
                const el = e.target
                el.style.height = 'auto'
                el.style.height = `${el.scrollHeight}px`
              }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); postEntry() } }}
              placeholder="What happened? A line is enough — or write the whole thing. (e.g. got a job at the mushroom farm / 2008 was a huge year...)"
              rows={1}
              style={{
                width: '100%', resize: 'none', overflow: 'hidden',
                background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--fg)', fontSize: 14.5, fontFamily: 'var(--font-body)',
                lineHeight: 1.6, padding: '6px 4px',
              }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="date"
                value={composeDate}
                onChange={e => setComposeDate(e.target.value)}
                title="Backdate this — leave blank for today. For a whole year like '2008', pick any day in it."
                style={{
                  background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 6,
                  color: 'var(--fg-2)', fontSize: 12.5, fontFamily: 'var(--font-mono)', padding: '5px 8px',
                }}
              />
              <button onClick={postEntry} disabled={!composeText.trim() || posting} className="canon-btn primary" style={{ fontSize: 12.5, padding: '6px 14px' }}>
                {posting ? 'Logging…' : 'Log it'}
              </button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-4)', marginLeft: 'auto' }}>
                ⌘/Ctrl + Enter to log
              </span>
            </div>
          </div>

          <CapturePanel onUploaded={loadReady}/>
        </section>

        {/* MIDDLE — the feed itself: your own posts, newest first */}
        <section style={{ padding: '0 0 40px' }}>
          <div className="canon-section-head" style={{ marginBottom: 16 }}>
            <h2>Your log</h2>
            <div className="meta">
              {feed === null ? '' : feed.length === 0 ? 'nothing logged yet' : `${feed.length} ${feed.length === 1 ? 'entry' : 'entries'}`}
            </div>
          </div>
          {feed === null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[0, 1].map(i => <div key={i} className="neolog-skeleton" style={{ height: 56, opacity: 1 - i * 0.3 }}/>)}
            </div>
          )}
          {feed !== null && feed.length === 0 && (
            <div style={{
              padding: '24px 24px', border: '1px dashed var(--line-2)', borderRadius: 12,
              color: 'var(--fg-3)', fontSize: 14, lineHeight: 1.55,
            }}>
              Nothing typed in yet. Use the box above — even one line, like "got a job today," is enough to start.
            </div>
          )}
          {feed !== null && feed.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {feed.map(e => (
                <div key={e.id} style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  padding: '12px 16px', borderRadius: 10,
                  background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderLeft: '2px solid var(--sig)',
                }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 0.8,
                    color: 'var(--fg-4)',
                  }}>
                    {fmtLogDate(e.occurred_at)}
                  </span>
                  {/* Long entries (a chapter, not a one-liner) keep their
                      line breaks and clip visually rather than blowing up
                      the feed — the full text is still stored and still
                      searchable, just not fully unrolled here. */}
                  <span style={{
                    fontSize: 14.5, lineHeight: 1.55, color: 'var(--fg-1)', whiteSpace: 'pre-wrap',
                    display: '-webkit-box', WebkitLineClamp: 8, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {e.text}
                  </span>
                </div>
              ))}
            </div>
          )}
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

// ─── Auto-shipped ribbon ─────────────────────────────────────────────────

function AutoShippedRibbon({ items }: { items: AutoShippedRecent[] }) {
  // Group by vlog so the message reads naturally when multiple clips
  // came from the same recording.
  const byVlog = new Map<string, AutoShippedRecent[]>()
  for (const it of items) {
    const k = it.vlog_id || 'unknown'
    if (!byVlog.has(k)) byVlog.set(k, [])
    byVlog.get(k)!.push(it)
  }
  const groups = Array.from(byVlog.entries())
  const total = items.length
  const sinceLabel = relativeDate(items[0]?.produced_at) || 'recently'

  return (
    <div style={{
      marginTop: 18, padding: '12px 18px',
      background: 'color-mix(in srgb, var(--sig) 8%, transparent)',
      border: '1px solid color-mix(in srgb, var(--sig) 40%, transparent)',
      borderRadius: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: 'var(--sig)',
          boxShadow: '0 0 8px var(--sig-glow)',
        }}/>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.8,
            textTransform: 'uppercase', color: 'var(--sig)',
          }}>
            Auto-published
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--fg-1)', marginTop: 2 }}>
            Posted <strong>{total} {total === 1 ? 'clip' : 'clips'}</strong> {sinceLabel}
            {groups.length === 1 && groups[0][0] !== 'unknown' ? ' from one vlog' : groups.length > 1 ? ` from ${groups.length} vlogs` : ''}
            {' · webhook fired to your fanout vendor'}
          </div>
        </div>
      </div>
      <Link href="/published" style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.4,
        textTransform: 'uppercase', color: 'var(--sig)',
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}>
        Review →
      </Link>
    </div>
  )
}

/** Recent → relative ("2h ago"); older or backdated → an absolute date, so a
 * backlogged "got a job last Thursday" entry doesn't read as "412d ago". */
function fmtLogDate(iso: string): string {
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const deltaMs = Date.now() - t
  const days = deltaMs / 86400000
  if (days >= 0 && days < 14) {
    const rel = relativeDate(iso)
    if (rel) return rel
  }
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function relativeDate(iso?: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const deltaMs = Date.now() - t
  const mins = Math.round(deltaMs / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
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

/** Visual frame for every card. Title block + caller-provided action row. */
function CardFrame({
  accent, eyebrow, title, sub, source, openHref, children,
}: {
  accent: string
  eyebrow: string
  title: string
  sub?: string | null
  source?: string | null
  openHref: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      padding: '16px 20px',
      background: 'var(--bg-1)',
      border: '1px solid var(--line-1)',
      borderLeft: `3px solid ${accent}`,
      borderRadius: 12,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <Link href={openHref} style={{
        display: 'block', textDecoration: 'none', color: 'inherit',
      }}>
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
      </Link>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        paddingTop: 10, borderTop: '1px solid var(--line-1)',
      }}>
        {children}
        <Link href={openHref} style={{
          marginLeft: 'auto',
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 1.4,
          textTransform: 'uppercase', color: 'var(--fg-3)',
          textDecoration: 'none',
        }}>
          Open →
        </Link>
      </div>
    </div>
  )
}

/** Primary action button used inside CardFrame's action row. */
function PrimaryBtn({ label, busy, onClick }: { label: string; busy?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="canon-btn primary"
      style={{ fontSize: 12, fontWeight: 500, padding: '6px 12px' }}
    >
      {busy ? 'Working…' : label}
    </button>
  )
}

/** Secondary "upgrade to a bigger output" chip. */
function AltChip({ label, busy, onClick }: { label: string; busy?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 1.2,
        textTransform: 'uppercase',
        padding: '5px 10px',
        background: 'transparent',
        color: 'var(--fg-2)',
        border: '1px solid var(--line-2)',
        borderRadius: 100,
        cursor: busy ? 'wait' : 'pointer',
      }}
    >
      {busy ? '…' : label}
    </button>
  )
}

/**
 * Hook: POST /api/v2/productions with the given source + type, navigate
 * to the resulting production page. Returns { run, busy, error }.
 */
type ProductionKind = 'x_post' | 'x_thread' | 'micro_essay' | 'article' | 'video_essay' | 'short' | 'clip'
function useProduce(router: ReturnType<typeof useRouter>) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async (
    label: string,
    source_kind: 'thread' | 'cluster' | 'topic',
    source_id: string,
    production_type: ProductionKind,
  ) => {
    setBusy(label); setError(null)
    try {
      const r = await fetch('/api/v2/productions', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_kind, source_id, production_type }),
      })
      const d: any = await r.json()
      if (!r.ok || !d?.id) throw new Error(d?.error || `HTTP ${r.status}`)
      router.push(`/production/${d.id}`)
    } catch (e: any) {
      setError(e?.message || String(e))
      setBusy(null)
    }
  }, [router])
  return { run, busy, error }
}

function ResumeCard({ item }: { item: Extract<ReadyItem, { kind: 'resume' }> }) {
  return (
    <CardFrame
      accent="var(--sig)"
      eyebrow={`Resume · ${item.production_type.replace(/_/g, ' ')}`}
      title={item.title}
      source={`State: ${item.state.replace(/_/g, ' ')}`}
      openHref={item.href}
    >
      <Link href={item.href} className="canon-btn primary" style={{ fontSize: 12, padding: '6px 12px' }}>
        Pick up
      </Link>
    </CardFrame>
  )
}

function QuoteCard({ item }: { item: Extract<ReadyItem, { kind: 'quote' }> }) {
  const router = useRouter()
  const { run, busy } = useProduce(router)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.quote)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  return (
    <CardFrame
      accent="var(--sig)"
      eyebrow={`Your line · strength ${item.strength}`}
      title={`"${item.quote}"`}
      sub={item.topic ? `On ${item.topic}` : null}
      source={item.vlog_title ? `from ${item.vlog_title}` : null}
      openHref={item.href}
    >
      <PrimaryBtn label={copied ? 'Copied ✓' : 'Copy as X post'} onClick={copy}/>
      <AltChip label="Clip"        busy={busy === 'clip'}        onClick={() => run('clip',        'thread', item.id, 'clip')}/>
      <AltChip label="Short"       busy={busy === 'short'}       onClick={() => run('short', 'thread', item.id, 'short')}/>
      <AltChip label="Micro essay" busy={busy === 'micro_essay'} onClick={() => run('micro_essay', 'thread', item.id, 'micro_essay')}/>
    </CardFrame>
  )
}

function ClipCard({ item }: { item: Extract<ReadyItem, { kind: 'clip' }> }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const dur = Math.max(0, Math.round(item.end_time - item.start_time))

  const ship = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`/api/v2/clip-candidates/${item.id}/ship-as-short`, {
        method: 'POST', credentials: 'include',
      })
      const d: any = await r.json()
      if (!r.ok || !d?.production_id) throw new Error(d?.error || `HTTP ${r.status}`)
      router.push(`/production/${d.production_id}`)
    } catch (e: any) {
      setErr(e?.message || String(e))
      setBusy(false)
    }
  }

  return (
    <CardFrame
      accent="var(--t-rose)"
      eyebrow={`Clip · ${dur}s delivery moment`}
      title={item.headline}
      sub={item.quote}
      source={item.vlog_title ? `from ${item.vlog_title}` : null}
      openHref={item.href}
    >
      <PrimaryBtn label="Ship as short" busy={busy} onClick={ship}/>
      <Link href={item.href} style={{
        fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 1.2,
        textTransform: 'uppercase', color: 'var(--fg-2)',
        padding: '5px 10px', border: '1px solid var(--line-2)',
        borderRadius: 100, textDecoration: 'none',
      }}>
        Review at source
      </Link>
      {err && <span style={{ fontSize: 11, color: 'var(--t-terra)' }}>{err}</span>}
    </CardFrame>
  )
}

function SubjectCard({ item }: { item: Extract<ReadyItem, { kind: 'subject' }> }) {
  const router = useRouter()
  const { run, busy } = useProduce(router)
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
    <CardFrame
      accent={accent}
      eyebrow={`${kindLabel} · from your vlogs`}
      title={item.name}
      sub={item.framing}
      source={source}
      openHref={item.href}
    >
      {item.production_id ? (
        <Link href={item.href} className="canon-btn primary" style={{ fontSize: 12, padding: '6px 12px' }}>
          Open the draft
        </Link>
      ) : (
        <Link href={`/subjects/${item.id}/skeleton`} className="canon-btn primary" style={{ fontSize: 12, padding: '6px 12px' }}>
          Plan the essay
        </Link>
      )}
      <AltChip label="Article"  busy={busy === 'article'}  onClick={() => run('article',  'cluster', item.id, 'article')}/>
      <AltChip label="X thread" busy={busy === 'x_thread'} onClick={() => run('x_thread', 'cluster', item.id, 'x_thread')}/>
      <AltChip label="Short"    busy={busy === 'short'}    onClick={() => run('short',    'cluster', item.id, 'short')}/>
    </CardFrame>
  )
}

function TopicCard({ item }: { item: Extract<ReadyItem, { kind: 'topic' }> }) {
  const router = useRouter()
  const { run, busy } = useProduce(router)
  return (
    <CardFrame
      accent="var(--t-steel)"
      eyebrow="Topic · researched"
      title={item.title}
      sub={item.framing}
      source="Research brief is ready · script not generated"
      openHref={item.href}
    >
      <PrimaryBtn label="Build the essay" busy={busy === 'video_essay'} onClick={() => run('video_essay', 'topic', item.id, 'video_essay')}/>
      <AltChip label="Article"     busy={busy === 'article'}     onClick={() => run('article',     'topic', item.id, 'article')}/>
      <AltChip label="X thread"    busy={busy === 'x_thread'}    onClick={() => run('x_thread',    'topic', item.id, 'x_thread')}/>
      <AltChip label="Short"       busy={busy === 'short'}       onClick={() => run('short',       'topic', item.id, 'short')}/>
    </CardFrame>
  )
}

function QuickVideoCard({ item }: { item: Extract<ReadyItem, { kind: 'quick_video' }> }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const spin = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/v2/shorts/spark', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept: item.seed }),
      })
      const d: any = await r.json()
      if (r.ok && d?.production_id) router.push(`/production/${d.production_id}`)
      else setBusy(false)
    } catch { setBusy(false) }
  }
  return (
    <CardFrame
      accent="var(--t-sage)"
      eyebrow="Quick video · drawn from your profile"
      title={item.seed}
      sub={item.why}
      openHref={item.href}
    >
      <PrimaryBtn label="Spin up the short" busy={busy} onClick={spin}/>
      <Link href={item.href} style={{
        fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 1.2,
        textTransform: 'uppercase', color: 'var(--fg-2)',
        padding: '5px 10px', border: '1px solid var(--line-2)',
        borderRadius: 100, textDecoration: 'none',
      }}>
        Upgrade to a full topic
      </Link>
    </CardFrame>
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
