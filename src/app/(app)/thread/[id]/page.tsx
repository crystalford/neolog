'use client'

/**
 * Thread detail — canon rebuild per
 * /tmp/neolognextlevel/design-reference/02-Thread.html
 *
 * Sections (top to bottom):
 *   1. Crumbs row     — Timeline / Threads / [Cluster] / current
 *   2. Detail hero    — topic + cluster pills + 56px h1 (with <mark> key phrases)
 *                       + meta strip (strength + articulated + span + visibility)
 *                       + actions column (Open cluster / Source vlog / Riff / Copy)
 *   3. Wavebox        — 240-bar waveform with thread span lit
 *   4. The Take       — editorial pull-quote with <mark> key phrases
 *   5. Body grid      — main + 320px rail
 *      main: transcript with inline t-span markers / key quotes / questions /
 *            cluster context (sibling list)
 *      rail: related / adjacent / entities / used-in
 *   6. Provenance     — 8-cell grid
 *   7. Footer         — colophon + j/k hints
 *
 * Topic territory flows from --topic on the wrapper. Token rebase to
 * cobalt/black palette per Phase 1.
 */

export const runtime = 'edge'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'
import {
  Wavebox, truncate, formatMmSs, formatDate, formatFullDate,
  insightKindLabel, renderInsightBody,
} from '@/components/threadkit'

// ─── Types from /api/v2/threads/[id] ─────────────────────────────────────
interface Word { word: string; start_time: number; end_time: number }
interface Thread {
  id: string; topic: string; take: string
  key_quotes: string[]; questions_raised: string[]; key_phrases: string[]
  register: string | null; strength: number | null
  transcript_span_start: number | null; transcript_span_end: number | null
  abstracted_topic: string | null
  extracted_at: string; extraction_prompt_version: string
  run_id: string | null; model: string | null; mode: string | null; extracted_total_items: number | null
}
interface Vlog {
  id: string; original_filename: string | null; recorded_at: string | null
  duration_sec: number | null; playback_url: string | null; thumbnail_url: string | null
}
interface Cluster {
  id: string; topic: string; abstracted_topic: string | null
  ripeness_score: number | null; thread_count: number; role: string | null
}
interface Payload {
  thread: Thread; vlog: Vlog
  transcript_window: { pre_words: Word[]; span_words: Word[]; post_words: Word[] }
  cluster: Cluster | null
  sibling_threads: { id: string; topic: string; take: string | null; extracted_at: string; strength: number | null; vlog_id: string }[]
  related_threads: { id: string; topic: string; take: string | null; abstracted_topic: string | null; extracted_at: string; strength: number | null; vlog_id: string }[]
  adjacent_insights: { kind: string; title: string | null; body: string; bounce_run_id: string | null }[]
  entities: { id: string; name: string; entity_type: string; mention_count: number | null }[]
  productions_used_in: { kind: string; id: string; title: string; state: string | null }[]
  navigation: { prev_thread_id: string | null; next_thread_id: string | null }
}

// ─── Page ────────────────────────────────────────────────────────────────
export default function ThreadDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentT, setCurrentT] = useState(0)
  const [playing, setPlaying] = useState(false)
  // Lazy-loaded segment audio (just the thread's span, not the full vlog).
  // Server caches the MP3 at {operator}/audio-segments/{thread_id}.mp3
  // after the first call.
  const [segment, setSegment] = useState<{ url: string; duration: number } | null>(null)
  const [segmentStatus, setSegmentStatus] = useState<'idle' | 'loading' | 'ready' | 'no-span' | 'failed'>('idle')
  const [segmentError, setSegmentError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/v2/threads/${params.id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: any) => setData(d as Payload))
      .catch(e => setError(String(e?.message || e)))
  }, [params.id])

  useEffect(() => {
    if (!data) return
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'j' && data.navigation.next_thread_id) router.push(`/thread/${data.navigation.next_thread_id}`)
      else if (e.key === 'k' && data.navigation.prev_thread_id) router.push(`/thread/${data.navigation.prev_thread_id}`)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [data, router])

  // Fetch the audio segment lazily once thread+span are known. Server
  // generates and caches on first call; subsequent calls return the
  // cached presigned URL fast.
  useEffect(() => {
    if (!data) return
    const t = data.thread
    if (t.transcript_span_start == null || t.transcript_span_end == null) {
      setSegmentStatus('no-span')
      return
    }
    setSegmentStatus('loading')
    setSegmentError(null)
    fetch(`/api/v2/threads/${params.id}/audio-segment`, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) {
          const d: any = await r.json().catch(() => ({}))
          throw new Error(d?.error || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((d: any) => {
        setSegment({ url: d.url, duration: Number(d.duration_sec) || (t.transcript_span_end! - t.transcript_span_start!) })
        setSegmentStatus('ready')
      })
      .catch(err => {
        setSegmentStatus('failed')
        setSegmentError(String(err?.message || err))
      })
  }, [data, params.id])

  if (error) return (
    <Shell>
      <CanonCrumbs trail={['Threads', 'Error']}/>
      <div style={{ padding: 40, color: 'var(--t-terra)' }}>Error: {error}</div>
    </Shell>
  )
  if (!data) return (
    <Shell>
      <CanonCrumbs trail={['Threads', '…']}/>
      <div style={{ padding: 40, color: 'var(--fg-3)' }}>Loading…</div>
    </Shell>
  )

  const { thread, vlog, transcript_window, cluster, sibling_threads, related_threads, adjacent_insights, entities, productions_used_in, navigation } = data
  const topicName = thread.abstracted_topic ?? thread.topic ?? 'misc'
  const topicCol = topicColor(topicName)

  return (
    <Shell>
      <div style={{ ['--topic' as any]: topicCol } as React.CSSProperties}>

        <CanonCrumbs
          trail={[
            { label: 'Timeline', href: '/' },
            { label: 'Threads', href: '/?filter=thread' },
            ...(cluster ? [{ label: truncate(cluster.abstracted_topic ?? cluster.topic, 28), href: `/studio/${cluster.id}` }] : []),
            { label: truncate(thread.topic, 40) },
          ]}
          prev={navigation.prev_thread_id ? `/thread/${navigation.prev_thread_id}` : null}
          next={navigation.next_thread_id ? `/thread/${navigation.next_thread_id}` : null}
          threadId={thread.id}
        />

        {/* Hero */}
        <section className="canon-detail-hero canon-reveal d2">
          <div>
            <div className="pills-row">
              <span className="topic-pill" style={{ '--topic': topicCol, '--topic-soft': `color-mix(in srgb, ${topicCol} 12%, transparent)` } as any}>
                <span className="type">Thread</span>
                <span className="sep">·</span>
                {thread.register ?? 'observation'}
              </span>
              {cluster && (
                <Link href={`/studio/${cluster.id}`} className="canon-cluster-pill">
                  <svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="5"/><circle cx="7" cy="7" r="2" fill="currentColor" stroke="none"/></svg>
                  In cluster · {truncate(cluster.abstracted_topic ?? cluster.topic, 28)}
                  {cluster.ripeness_score != null && <span className="accent">· {Math.round(cluster.ripeness_score)} ripe</span>}
                </Link>
              )}
            </div>
            <h1>
              <Highlighted text={headlineText(thread)} phrases={thread.key_phrases} useMark/>
            </h1>
            <div className="meta-strip">
              <CanonStrengthRow n={thread.strength ?? 0} color={topicCol}/>
              <span>Articulated <strong>{formatDate(thread.extracted_at)}</strong></span>
              {thread.transcript_span_start != null && thread.transcript_span_end != null && (
                <span>Span <strong>{formatMmSs(thread.transcript_span_end - thread.transcript_span_start)}</strong> in vlog</span>
              )}
              <span><strong>Private</strong></span>
            </div>
          </div>
          <div className="actions">
            {cluster && (
              <Link className="action primary" href={`/studio/${cluster.id}`}>
                Open cluster
                <span><svg width="11" height="11" viewBox="0 0 14 14"><path d="M3 7 L11 7 M8 4 L11 7 L8 10" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg></span>
              </Link>
            )}
            <Link className="action" href={`/vlog/${vlog.id}`}>
              Open source vlog
              <span style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>V</span>
            </Link>
            <button className="action" onClick={() => {
              navigator.clipboard?.writeText(`${location.origin}/thread/${thread.id}`).catch(() => {})
            }}>
              Copy link
            </button>
          </div>
        </section>

        {/* Wavebox — plays JUST the thread's span (audio segment lazily
            sliced server-side, R2-cached). Falls back to a helpful
            message when span is missing or generation fails. */}
        <section className="canon-reveal d3" style={{ marginBottom: 32 }}>
          {segmentStatus === 'no-span' && (
            <div style={{
              padding: '18px 22px',
              background: 'var(--bg-1)',
              border: '1px dashed var(--line-2)',
              borderLeft: `2px solid ${topicCol}`,
              borderRadius: 10,
              display: 'flex', alignItems: 'flex-start', gap: 14,
              fontSize: 13.5, color: 'var(--fg-2)', lineHeight: 1.55,
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5,
                letterSpacing: 1.6, textTransform: 'uppercase',
                color: 'var(--fg-3)', flexShrink: 0,
              }}>No span</span>
              <div style={{ flex: 1 }}>
                This thread doesn't have a computed transcript span yet, so the audio segment
                can't be sliced. Open the source vlog and run <strong style={{ color: 'var(--fg-1)' }}>Re-extract</strong> to populate it.
                <div style={{ marginTop: 10 }}>
                  <Link href={`/vlog/${vlog.id}`} className="canon-btn ghost" style={{ fontSize: 12 }}>
                    Open source vlog
                  </Link>
                </div>
              </div>
            </div>
          )}
          {segmentStatus === 'loading' && (
            <div style={{
              padding: '18px 22px',
              background: 'var(--bg-1)',
              border: '1px solid var(--line-1)',
              borderRadius: 10,
              color: 'var(--fg-3)', fontSize: 13.5,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: topicCol,
                boxShadow: `0 0 6px ${topicCol}`,
                animation: 'canon-pulse 1.4s ease-in-out infinite',
              }}/>
              Slicing the segment from R2… first call takes a few seconds; cached after that.
            </div>
          )}
          {segmentStatus === 'failed' && (
            <div style={{
              padding: '18px 22px',
              background: 'rgba(230,99,74,0.06)',
              border: '1px solid var(--t-terra)',
              borderRadius: 10,
              color: 'var(--fg-1)', fontSize: 13.5, lineHeight: 1.5,
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5,
                letterSpacing: 1.6, textTransform: 'uppercase',
                color: 'var(--t-terra)', marginBottom: 6,
              }}>Segment failed</div>
              {segmentError || 'Could not generate the audio segment.'}
            </div>
          )}
          {segmentStatus === 'ready' && segment && (
            <Wavebox
              title={deriveVlogTitle(vlog.original_filename)}
              subtitle={vlog.recorded_at ? formatFullDate(vlog.recorded_at) : undefined}
              durationSec={segment.duration}
              bands={[{
                start: 0,
                end: segment.duration,
                color: topicCol,
                label: 'thread span',
              }]}
              currentT={currentT} setCurrentT={setCurrentT}
              playing={playing} setPlaying={setPlaying}
              audioId={`thread-audio-${thread.id}`}
              audioSrc={segment.url}
              accentColor={topicCol}
              mediaLabel={`THREAD SEGMENT · ${formatMmSs(segment.duration)} · from ${thread.transcript_span_start != null ? formatMmSs(thread.transcript_span_start) : '?'} in vlog`}
            />
          )}
        </section>

        {/* The Take pull-quote */}
        <section className="canon-pull canon-reveal d3">
          <div className="label">The take</div>
          <div className="quote">
            <Highlighted text={thread.take || thread.key_quotes[0] || thread.topic} phrases={thread.key_phrases} useMark/>
          </div>
        </section>

        {/* Body grid */}
        <div className="canon-detail-body">
          <div className="canon-detail-main">

            {/* Transcript with inline span markers */}
            <section className="canon-section canon-reveal d4">
              <div className="canon-section-head">
                <h2>Transcript span <span className="meta">{
                  thread.transcript_span_start != null && thread.transcript_span_end != null
                    ? `· ${formatMmSs(thread.transcript_span_start)} → ${formatMmSs(thread.transcript_span_end)} · ${Math.round(thread.transcript_span_end - thread.transcript_span_start)} sec`
                    : ''
                }</span></h2>
                <div className="meta">word-timestamped · whisper v3</div>
              </div>
              <TranscriptInline
                window={transcript_window}
                keyPhrases={thread.key_phrases}
                spanStart={thread.transcript_span_start}
                spanEnd={thread.transcript_span_end}
                topicColor={topicCol}
              />
            </section>

            {/* Key quotes */}
            {thread.key_quotes.length > 0 && (
              <section className="canon-section canon-reveal d5">
                <div className="canon-section-head">
                  <h2>Key quotes <span className="meta">· {thread.key_quotes.length} verbatim from span</span></h2>
                  <div className="meta">selected by extractor</div>
                </div>
                <div className="canon-quote-list">
                  {thread.key_quotes.map((q, i) => (
                    <div key={i} className="canon-quote-item">“{q}”</div>
                  ))}
                </div>
              </section>
            )}

            {/* Questions raised */}
            {thread.questions_raised.length > 0 && (
              <section className="canon-section canon-reveal d5">
                <div className="canon-section-head">
                  <h2>Questions raised <span className="meta">· pending bounce</span></h2>
                  <div className="meta">extractor + system</div>
                </div>
                <div className="canon-questions">
                  {thread.questions_raised.map((q, i) => (
                    <div key={i} className="canon-question">{q}</div>
                  ))}
                </div>
              </section>
            )}

            {/* Cluster context */}
            {cluster && (
              <section className="canon-section canon-reveal d6">
                <div className="canon-section-head">
                  <h2>Cluster context <span className="meta">· {cluster.thread_count} sibling{cluster.thread_count === 1 ? '' : 's'}</span></h2>
                  <div className="meta">{cluster.ripeness_score != null ? `${Math.round(cluster.ripeness_score)} ripe` : ''}</div>
                </div>
                <ClusterContext cluster={cluster} siblings={sibling_threads} currentId={thread.id}/>
              </section>
            )}
          </div>

          {/* Rail */}
          <aside className="canon-detail-rail">
            {related_threads.length > 0 && (
              <div className="rail-card canon-reveal d4">
                <div className="rc-head"><h3>Related threads</h3>
                  {related_threads.length > 4 && <span className="more">all {related_threads.length} →</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {related_threads.slice(0, 4).map(r => (
                    <Link key={r.id} href={`/thread/${r.id}`} className="canon-sibling"
                      style={{ '--c': topicColor(r.abstracted_topic ?? r.topic) } as any}>
                      <span className="dot"/>
                      <span className="name">{truncate(r.topic, 60)}</span>
                      <span className="strength">
                        {[1,2,3,4,5].map(i => <span key={i} className={`pip ${i <= (r.strength ?? 0) ? 'on' : ''}`}/>)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {adjacent_insights.length > 0 && (
              <div className="rail-card canon-reveal d5">
                <div className="rc-head"><h3>Adjacent insights</h3>
                  <span className="more">attach →</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {adjacent_insights.slice(0, 4).map((ai, i) => (
                    <div key={i} style={{
                      padding: '12px 14px',
                      borderRadius: 9,
                      border: '1px dashed var(--line-2)',
                      background: 'var(--bg-1)',
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: 'var(--fg-1)',
                    }}>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1.5,
                        textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 6,
                      }}>{insightKindLabel(ai.kind)}</div>
                      <div dangerouslySetInnerHTML={{ __html: renderInsightBody(ai.body) }}/>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {entities.length > 0 && (
              <div className="rail-card canon-reveal d5">
                <div className="rc-head"><h3>Entities</h3>
                  <span className="more">graph →</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {entities.slice(0, 12).map(e => (
                    <Link key={e.id} href={`/entity/${e.id}`} className="canon-entity-chip">
                      <span className="glyph">{e.name.slice(0, 2).toUpperCase()}</span>
                      {truncate(e.name, 22)}
                      {e.mention_count != null && <span className="n">·{e.mention_count}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {productions_used_in.length > 0 && (
              <div className="rail-card canon-reveal d6">
                <div className="rc-head"><h3>Used in</h3>
                  <span className="more">{productions_used_in.length} {productions_used_in.length === 1 ? 'production' : 'productions'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {productions_used_in.slice(0, 4).map(p => (
                    <Link key={p.id} href={`/productions/${p.id}`} style={{
                      display: 'block',
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'var(--bg-2)',
                      border: '1px solid var(--line-1)',
                      color: 'inherit',
                      textDecoration: 'none',
                    }}>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1.5,
                        textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 4,
                      }}>{p.kind} {p.state && `· ${p.state}`}</div>
                      <div style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500 }}>{truncate(p.title, 60)}</div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        {/* Provenance */}
        <section className="canon-prov-grid canon-reveal d6" style={{ marginTop: 32 }}>
          <ProvCell label="Extracted" value={formatFullDate(thread.extracted_at)}/>
          <ProvCell label="Prompt version" value={thread.extraction_prompt_version || '—'} mono/>
          <ProvCell label="Model" value={thread.model || 'unknown'} mono/>
          <ProvCell label="Mode" value={thread.mode || 'unknown'} mono/>
          <ProvCell label="Vlog id" value={vlog.id} mono link={`/vlog/${vlog.id}`} linkText={truncate(vlog.id, 18)}/>
          <ProvCell label="Thread id" value={thread.id} mono/>
          <ProvCell label="Run id" value={thread.run_id || '—'} mono/>
          <ProvCell label="Total items" value={String(thread.extracted_total_items ?? '—')} mono/>
        </section>

        {/* Footer */}
        <footer className="canon-detail-footer">
          <span>neolog · thread {truncate(thread.id, 22)}</span>
          <span className="kbd-row">
            <span className="kbd">J</span> next
            <span className="kbd">K</span> prev
          </span>
        </footer>

      </div>
    </Shell>
  )
}

// ─── Subcomponents ───────────────────────────────────────────────────────

type CrumbItem = { label: string; href?: string } | string

function CanonCrumbs({ trail, prev, next, threadId }: {
  trail: CrumbItem[]
  prev?: string | null
  next?: string | null
  threadId?: string
}) {
  return (
    <div className="canon-crumbs">
      {trail.map((c, i) => {
        const isLast = i === trail.length - 1
        const item = typeof c === 'string' ? { label: c } : c
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
            {item.href && !isLast ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span className={isLast ? 'here' : ''}>{item.label}</span>
            )}
            {!isLast && <span className="sep">/</span>}
          </span>
        )
      })}
      <div className="spacer"/>
      {(prev || next || threadId) && (
        <div className="navbtns">
          <Link href={prev ?? '#'} className="navbtn" aria-disabled={!prev}>
            ◂ Prev <span className="kbd">K</span>
          </Link>
          <Link href={next ?? '#'} className="navbtn" aria-disabled={!next}>
            Next ▸ <span className="kbd">J</span>
          </Link>
          {threadId && (
            <button className="navbtn" onClick={() => {
              navigator.clipboard?.writeText(`${location.origin}/thread/${threadId}`).catch(() => {})
            }} title="Copy link">⎘</button>
          )}
        </div>
      )}
    </div>
  )
}

function CanonStrengthRow({ n, color }: { n: number; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      Strength
      <span style={{ display: 'inline-flex', gap: 3 }}>
        {[1,2,3,4,5].map(i => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: i <= n ? color : 'var(--bg-5)',
            boxShadow: i <= n ? `0 0 4px ${color}80` : 'none',
          }}/>
        ))}
      </span>
      <span style={{ color, fontFamily: 'var(--font-body)', fontSize: 13, textTransform: 'none', letterSpacing: '-0.2px', fontWeight: 500 }}>
        {n} of 5
      </span>
    </span>
  )
}

function ProvCell({ label, value, mono, link, linkText }: {
  label: string; value: string; mono?: boolean; link?: string; linkText?: string
}) {
  return (
    <div className="canon-prov-cell">
      <span className="l">{label}</span>
      <span className={`v ${mono ? 'mono' : ''}`}>
        {link ? <Link href={link}>{linkText ?? value}</Link> : value}
      </span>
    </div>
  )
}

/** Render text with `phrases` substrings wrapped in <mark>. */
function Highlighted({ text, phrases, useMark }: { text: string; phrases: string[]; useMark?: boolean }) {
  if (!phrases || phrases.length === 0) return <>{text}</>
  const escaped = phrases
    .filter(p => p && p.trim().length > 1)
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length)
  if (escaped.length === 0) return <>{text}</>
  const re = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(re)
  return (
    <>
      {parts.map((p, i) => {
        const isMatch = i % 2 === 1
        if (!isMatch) return <span key={i}>{p}</span>
        return useMark ? <mark key={i}>{p}</mark> : <span key={i} style={{ borderBottom: '2px solid var(--topic)' }}>{p}</span>
      })}
    </>
  )
}

/** Transcript with the thread's span lit by topic color + inline key-phrase highlighting. */
function TranscriptInline({
  window: w, keyPhrases, spanStart, spanEnd, topicColor: col,
}: {
  window: { pre_words: Word[]; span_words: Word[]; post_words: Word[] }
  keyPhrases: string[]
  spanStart: number | null
  spanEnd: number | null
  topicColor: string
}) {
  const renderText = (words: Word[]) => words.map(w => w.word).join(' ')
  const pre = renderText(w.pre_words)
  const span = renderText(w.span_words)
  const post = renderText(w.post_words)

  return (
    <div className="canon-transcript">
      {pre && <span className="pre">{pre}</span>}
      {span && (
        <>
          {spanStart != null && <div className="t-span" data-badge={`Thread begins · ${formatMmSs(spanStart)}`} style={{ borderLeft: `2px solid ${col}` }}>
            <Highlighted text={span} phrases={keyPhrases}/>
          </div>}
          {spanStart == null && <div className="t-span" data-badge="Thread span"><Highlighted text={span} phrases={keyPhrases}/></div>}
        </>
      )}
      {post && <span className="post"> {post}</span>}
    </div>
  )
}

function ClusterContext({ cluster, siblings, currentId }: {
  cluster: Cluster; siblings: Payload['sibling_threads']; currentId: string
}) {
  if (siblings.length === 0) {
    return <div className="canon-empty-hint">No sibling threads in this cluster yet — it'll fill in as more get linked.</div>
  }
  return (
    <div className="canon-siblings">
      {siblings.map(s => {
        const c = topicColor(s.topic ?? cluster.topic)
        const isCurrent = s.id === currentId
        return (
          <Link key={s.id} href={`/thread/${s.id}`} className="canon-sibling"
            style={{ '--c': c, opacity: isCurrent ? 0.7 : 1 } as any}>
            <span className="dot"/>
            <span className="name">{truncate(s.take ?? s.topic, 80)}{isCurrent && ' · you are here'}</span>
            <span className="strength">
              {[1,2,3,4,5].map(i => <span key={i} className={`pip ${i <= (s.strength ?? 0) ? 'on' : ''}`}/>)}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

function deriveVlogTitle(filename: string | null): string {
  if (!filename) return 'Untitled vlog'
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, ch => ch.toUpperCase()) || 'Untitled vlog'
}

function headlineText(t: Thread): string {
  // Use the take as the headline; fall back to topic.
  if (t.take && t.take.length >= 20) return t.take
  return t.topic || 'Thread'
}
