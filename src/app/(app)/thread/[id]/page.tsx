/**
 * Thread detail page — comprehensive rebuild matching the design
 * prototype (Thread.html). Sections, top to bottom:
 *
 *   1. Crumbs row     — breadcrumb + Prev/Next + copy-link
 *   2. Hero           — topic+cluster pills + h1 + strength + meta + actions
 *   3. Wavebox        — header + 240-bar SVG waveform with span lit
 *   4. The Take       — pull-quote with key_phrases marker-highlighted
 *   5. Body grid      — main column + right rail (340px)
 *      main: transcript span / key quotes / questions / cluster context
 *      rail: related / adjacent insights / entities / used in
 *   6. Provenance     — 8-cell grid (extracted at / prompt version / model / cost / ids / re-runs / audit)
 *   7. Footer         — colophon + keyboard hints
 *
 * Topic color flows from --topic CSS var set on the outer wrapper
 * via topicColor(abstracted_topic).
 *
 * Empty-state handling: every backing query in /api/v2/threads/[id]
 * returns arrays; this page renders empty-state CTAs ("run cultivate",
 * "no productions yet") instead of breaking when data isn't populated.
 * That lets the comprehensive layout ship before all the data substrate
 * (Deploy 2 work) is in place.
 */
'use client'

export const runtime = 'edge'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'

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

export default function ThreadDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentT, setCurrentT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null)

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

  useEffect(() => {
    if (!audioEl || !data) return
    const start = data.thread.transcript_span_start
    if (start != null && audioEl.currentTime < start) audioEl.currentTime = start
  }, [audioEl, data])

  if (error) return (
    <Shell active="threads" breadcrumb={['Threads', 'Error']}>
      <div className="pad-tight" style={{ color: 'var(--err)' }}>Error: {error}</div>
    </Shell>
  )
  if (!data) return (
    <Shell active="threads" breadcrumb={['Threads', '…']}>
      <div className="pad-tight" style={{ color: 'var(--fg-3)' }}>Loading…</div>
    </Shell>
  )

  const { thread, vlog, transcript_window, cluster, sibling_threads, related_threads, adjacent_insights, entities, productions_used_in, navigation } = data
  const topic = thread.abstracted_topic ?? thread.topic ?? 'misc'
  const color = topicColor(topic)

  return (
    <Shell active="threads" breadcrumb={['Threads', truncate(thread.topic, 40)]}>
      <div style={{ ['--topic' as any]: color } as React.CSSProperties}>

        {/* Crumbs + nav */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 36px', borderBottom: '1px solid var(--line)',
        }}>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flex: 1, minWidth: 0 }}>
            <Link href="/" style={{ color: 'var(--fg-3)', textDecoration: 'none' }}>Timeline</Link>
            <Sep/>
            <Link href="/threads" style={{ color: 'var(--fg-3)', textDecoration: 'none' }}>Threads</Link>
            {cluster && <>
              <Sep/>
              <Link href={`/cluster/${cluster.id}`} style={{ color: 'var(--fg-3)', textDecoration: 'none' }}>
                {truncate(cluster.abstracted_topic ?? cluster.topic, 32)}
              </Link>
            </>}
            <Sep/>
            <span style={{ color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{truncate(thread.topic, 40)}</span>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <NavBtn disabled={!navigation.prev_thread_id}
              onClick={() => navigation.prev_thread_id && router.push(`/thread/${navigation.prev_thread_id}`)}
              label="◂ Prev" hint="K"/>
            <NavBtn disabled={!navigation.next_thread_id}
              onClick={() => navigation.next_thread_id && router.push(`/thread/${navigation.next_thread_id}`)}
              label="Next ▸" hint="J"/>
            <IconBtn title="Copy link" onClick={() => {
              navigator.clipboard?.writeText(`${location.origin}/thread/${thread.id}`).catch(() => {})
            }}>
              <svg viewBox="0 0 14 14" width="13" height="13"><path d="M6 4 L10 4 A2 2 0 0 1 12 6 L12 10" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M8 10 L4 10 A2 2 0 0 1 2 8 L2 4 A2 2 0 0 1 4 2 L8 2" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg>
            </IconBtn>
          </div>
        </div>

        {/* Hero */}
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 32, padding: '32px 36px 24px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
              <span style={pillTopic()}>
                <span style={{ color: 'var(--fg-1)' }}>Thread</span>
                <span style={{ color: 'var(--fg-5)', margin: '0 4px' }}>·</span>
                {thread.register ?? 'observation'}
              </span>
              {cluster && (
                <Link href={`/cluster/${cluster.id}`} style={pillCluster(color)}>
                  <svg viewBox="0 0 14 14" width="11" height="11" style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 1.6 }}>
                    <circle cx="7" cy="7" r="5"/><circle cx="7" cy="7" r="2" fill="currentColor" stroke="none"/>
                  </svg>
                  In cluster · {truncate(cluster.abstracted_topic ?? cluster.topic, 28)}
                  {cluster.ripeness_score != null && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>· {cluster.ripeness_score} ripe</span>}
                </Link>
              )}
            </div>
            <h1 style={{ fontSize: 38, fontWeight: 500, letterSpacing: '-1px', lineHeight: 1.15, margin: 0, color: 'var(--fg)' }}>
              <Highlighted text={headlineText(thread)} phrases={thread.key_phrases} color={color}/>
            </h1>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 22, marginTop: 18, flexWrap: 'wrap',
              fontSize: 12, color: 'var(--fg-3)',
              fontFamily: 'Geist Mono, ui-monospace, monospace',
            }}>
              <Strength n={thread.strength ?? 0} color={color}/>
              <Meta icon="clock" label="Articulated" value={formatDate(thread.extracted_at)}/>
              {thread.transcript_span_start != null && thread.transcript_span_end != null && (
                <Meta icon="span" label="Span" value={formatDuration(thread.transcript_span_end - thread.transcript_span_start) + ' in vlog'}/>
              )}
              <Meta icon="lock" label="" value="Private"/>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Action primary label="Riff on this" hint="R" onClick={() => alert('Riff workflow — coming next')}/>
            {cluster && <Action label="Open in Studio" hint="S" onClick={() => router.push(`/cluster/${cluster.id}`)}/>}
            <Action label="Materialize" onClick={() => alert('Materialize — coming with production engine')}/>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '6px 0' }}/>
            <Action label="Cite as source" onClick={() => navigator.clipboard?.writeText(`${location.origin}/thread/${thread.id}`).catch(() => {})}/>
            <Action label="Snooze" onClick={() => alert('Snooze — coming next')}/>
          </div>
        </section>

        {/* Wavebox */}
        <section style={{ padding: '0 36px 32px' }}>
          <Wavebox vlog={vlog} thread={thread} color={color}
            currentT={currentT} setCurrentT={setCurrentT}
            playing={playing} setPlaying={setPlaying} setAudioEl={setAudioEl}/>
        </section>

        {/* The Take */}
        <section style={{ padding: '0 36px 36px' }}>
          <div style={{ padding: '24px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
            <div style={editorialLabel(color, 8)}>The take</div>
            <div style={{
              fontSize: 22, lineHeight: 1.5, color: 'var(--fg-1)',
              fontStyle: thread.take.length < 200 ? 'italic' : 'normal',
              maxWidth: 960,
            }}>
              <Highlighted text={thread.take || thread.key_quotes[0] || thread.topic} phrases={thread.key_phrases} color={color}/>
            </div>
          </div>
        </section>

        {/* Body grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 340px', gap: 36, padding: '0 36px 40px' }}>

          {/* Main */}
          <div style={{ minWidth: 0 }}>

            <SectionBlock label="Transcript span" count={
              thread.transcript_span_start != null && thread.transcript_span_end != null
                ? `${formatMmSs(thread.transcript_span_start)} → ${formatMmSs(thread.transcript_span_end)} · ${Math.round(thread.transcript_span_end - thread.transcript_span_start)} sec`
                : 'no span yet'
            } meta="word-timestamped · whisper">
              <TranscriptSpan window={transcript_window} keyPhrases={thread.key_phrases} color={color}
                spanStart={thread.transcript_span_start} spanEnd={thread.transcript_span_end}
                onSeek={(t) => { if (audioEl) { audioEl.currentTime = t; audioEl.play(); setPlaying(true) } }}/>
            </SectionBlock>

            {thread.key_quotes.length > 0 && (
              <SectionBlock label="Key quotes" count={`${thread.key_quotes.length} · verbatim from span`} meta="selected by extractor">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {thread.key_quotes.map((q, i) => (
                    <div key={i} style={{
                      padding: '14px 18px',
                      background: 'var(--bg-1)', border: '1px solid var(--line)',
                      borderLeft: `3px solid ${color}`, borderRadius: 6,
                      fontSize: 15, color: 'var(--fg-1)', lineHeight: 1.55, fontStyle: 'italic',
                    }}>“{q}”</div>
                  ))}
                </div>
              </SectionBlock>
            )}

            {thread.questions_raised.length > 0 ? (
              <SectionBlock label="Questions raised" count={`${thread.questions_raised.length} · pending bounce`} meta="extractor + system">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {thread.questions_raised.map((q, i) => (
                    <div key={i} style={{
                      padding: '12px 14px', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 6,
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'var(--bg-3)', border: '1px solid var(--line-1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, color: 'var(--fg-3)', flexShrink: 0,
                      }}>?</span>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.5 }}>{q}</span>
                      <span style={{
                        fontSize: 9, color: 'var(--accent)',
                        background: 'var(--accent-bg)', border: '1px solid var(--accent-bd)',
                        padding: '3px 8px', borderRadius: 999,
                        textTransform: 'uppercase', letterSpacing: 0.6,
                        fontFamily: 'Geist Mono, ui-monospace, monospace',
                      }}>Bounce ready</span>
                    </div>
                  ))}
                </div>
              </SectionBlock>
            ) : (
              <SectionBlock label="Questions raised" count="—" meta="will populate after re-extraction">
                <EmptyHint>Questions extraction was added recently. Re-extract this vlog to populate.</EmptyHint>
              </SectionBlock>
            )}

            {cluster && (
              <SectionBlock label="Cluster context" count={`${cluster.thread_count} sibling${cluster.thread_count === 1 ? '' : 's'}`} meta={`${cluster.ripeness_score ?? 0} ripe`}>
                <ClusterContext cluster={cluster} siblings={sibling_threads} currentId={thread.id} color={color}/>
              </SectionBlock>
            )}
          </div>

          {/* Rail */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>

            <RailCard label="Related threads" more={related_threads.length > 4 ? `all ${related_threads.length}` : null}>
              {related_threads.length === 0 ? (
                <EmptyHint>No auto-linked threads on this topic yet.</EmptyHint>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {related_threads.slice(0, 4).map(r => (
                    <Link key={r.id} href={`/thread/${r.id}`} style={{
                      display: 'block', padding: '10px 12px', borderRadius: 6,
                      background: 'var(--bg-1)',
                      borderLeft: `2px solid ${topicColor(r.abstracted_topic ?? r.topic)}`,
                      textDecoration: 'none',
                    }}>
                      <div style={editorialLabel(topicColor(r.abstracted_topic ?? r.topic), 6)}>
                        {truncate(r.abstracted_topic ?? r.topic, 24)}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.4, marginBottom: 6 }}>
                        {truncate(r.take ?? r.topic, 80)}
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 10, color: 'var(--fg-4)',
                        fontFamily: 'Geist Mono, ui-monospace, monospace',
                      }}>
                        <span>{formatDate(r.extracted_at)}</span>
                        <Strength n={r.strength ?? 0} color={topicColor(r.abstracted_topic ?? r.topic)} compact/>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </RailCard>

            <RailCard label="Adjacent insights" more={cluster ? 'attach' : null}>
              {adjacent_insights.length === 0 ? (
                <EmptyHint>
                  {cluster ? <>Run <Link href={`/cluster/${cluster.id}`} style={{ color: 'var(--accent)' }}>cultivate on this cluster</Link> to surface named concepts + adjacent thinkers.</> : 'No cluster yet — this thread isn\'t grouped with siblings.'}
                </EmptyHint>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {adjacent_insights.slice(0, 5).map((ins, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{
                        width: 22, height: 22, flexShrink: 0,
                        borderRadius: '50%', border: '1px solid var(--accent-bd)',
                        background: 'var(--accent-bg)', color: 'var(--accent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12,
                      }}>↑</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={editorialLabel('var(--accent)', 4)}>
                          {ins.title ? `${insightKindLabel(ins.kind)} · ${truncate(ins.title, 20)}` : insightKindLabel(ins.kind)}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--fg-1)', lineHeight: 1.55 }}
                          dangerouslySetInnerHTML={{ __html: renderInsightBody(ins.body) }}/>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </RailCard>

            <RailCard label="Entities mentioned" more={entities.length > 0 ? 'graph' : null}>
              {entities.length === 0 ? (
                <EmptyHint>No entities extracted for this thread.</EmptyHint>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {entities.slice(0, 18).map(e => <EntityChip key={e.id} entity={e}/>)}
                </div>
              )}
            </RailCard>

            <RailCard label="Used in" more={productions_used_in.length > 0 ? `${productions_used_in.length} production${productions_used_in.length === 1 ? '' : 's'}` : null}>
              {productions_used_in.length === 0 ? (
                <EmptyHint>Not used in any productions yet. Materialize this cluster to start one.</EmptyHint>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {productions_used_in.map((p, i) => (
                    <div key={i} style={{ padding: '8px 10px', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12 }}>
                      <div style={{ ...editorialLabel('var(--fg-3)', 4), marginBottom: 4 }}>{p.kind} · {p.state ?? 'draft'}</div>
                      <div style={{ color: 'var(--fg-1)' }}>{p.title || '(untitled)'}</div>
                    </div>
                  ))}
                </div>
              )}
            </RailCard>
          </aside>
        </div>

        {/* Provenance */}
        <section style={{
          margin: '0 36px', padding: '20px 0',
          borderTop: '1px solid var(--line)',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px 32px',
        }}>
          <Prov label="Extracted" value={formatFullDate(thread.extracted_at)}/>
          <Prov label="Prompt version" value={thread.extraction_prompt_version}/>
          <Prov label="Model" value={thread.model ?? '—'}/>
          <Prov label="Items in run" value={thread.extracted_total_items != null ? `${thread.extracted_total_items}` : '—'}/>
          <Prov label="Vlog" value={vlog.original_filename ?? '—'} link={`/timeline/${vlog.id}`} linkText={vlog.original_filename ?? vlog.id.slice(0, 14) + '…'}/>
          <Prov label="Thread id" value={thread.id} mono/>
          <Prov label="Run id" value={thread.run_id ?? '—'} mono/>
          <Prov label="Audit" value="—" link={`/timeline/${vlog.id}`} linkText="open vlog →"/>
        </section>

        {/* Footer */}
        <footer style={{
          padding: '14px 36px 28px', marginTop: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 10, color: 'var(--fg-4)',
          fontFamily: 'Geist Mono, ui-monospace, monospace',
          letterSpacing: 0.4, textTransform: 'uppercase',
        }}>
          <span>neolog.ai · thread {thread.id.slice(0, 16)}…</span>
          <span>↑ to top · J / K to navigate · R to riff</span>
        </footer>
      </div>
    </Shell>
  )
}

// ── helpers + subcomponents ────────────────────────────────────────

function Sep() { return <span style={{ color: 'var(--fg-5)' }}>/</span> }

function NavBtn({ disabled, onClick, label, hint }: { disabled?: boolean; onClick: () => void; label: string; hint?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '4px 9px', fontSize: 11,
      background: 'transparent', color: disabled ? 'var(--fg-5)' : 'var(--fg-2)',
      border: '1px solid var(--line)', borderRadius: 5, cursor: disabled ? 'default' : 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      {label}
      {hint && !disabled && <span style={{
        fontSize: 9, color: 'var(--fg-4)', background: 'var(--bg-2)',
        padding: '1px 4px', borderRadius: 3,
        fontFamily: 'Geist Mono, ui-monospace, monospace',
      }}>{hint}</span>}
    </button>
  )
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} style={{
      width: 28, height: 28, padding: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent', color: 'var(--fg-3)',
      border: '1px solid var(--line)', borderRadius: 5, cursor: 'pointer',
    }}>{children}</button>
  )
}

function pillTopic(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', padding: '5px 10px', borderRadius: 999,
    background: 'var(--bg-1)', border: '1px solid var(--line-1)',
    color: 'var(--fg-2)', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase',
    fontFamily: 'Geist Mono, ui-monospace, monospace',
  }
}
function pillCluster(color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '5px 11px', borderRadius: 999,
    background: 'var(--bg-1)', border: '1px solid var(--line-1)',
    color, textDecoration: 'none',
    fontSize: 11, letterSpacing: 0.4,
    fontFamily: 'Geist Mono, ui-monospace, monospace',
  }
}
function editorialLabel(color: string, mb: number = 8): React.CSSProperties {
  return {
    fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase',
    color, fontWeight: 600,
    fontFamily: 'Geist Mono, ui-monospace, monospace',
    marginBottom: mb,
  }
}

function Strength({ n, color, compact }: { n: number; color: string; compact?: boolean }) {
  const dots = Array.from({ length: 5 }, (_, i) => i < n)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      {!compact && <span>Strength</span>}
      <span style={{ display: 'inline-flex', gap: 3 }}>
        {dots.map((on, i) => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: on ? color : 'var(--bg-4)',
            boxShadow: on ? `0 0 4px ${color}33` : 'none',
          }}/>
        ))}
      </span>
      {!compact && <span style={{ color, fontFamily: 'Geist, system-ui, sans-serif', fontSize: 13, textTransform: 'none', letterSpacing: '-0.2px', fontWeight: 500 }}>{n} of 5</span>}
    </span>
  )
}

function Meta({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <IconSpan kind={icon}/>
      {label && <span>{label}</span>}
      <b style={{ color: 'var(--fg-1)', fontWeight: 500, fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.1px', textTransform: 'none', fontSize: 12 }}>{value}</b>
    </span>
  )
}
function IconSpan({ kind }: { kind: string }) {
  const props = { width: 11, height: 11, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 } as any
  if (kind === 'clock') return <svg {...props}><circle cx={7} cy={7} r={5}/><path d="M7 4 L7 7 L9 8"/></svg>
  if (kind === 'span')  return <svg {...props}><path d="M3 4 L11 4 L11 11 L3 11 Z M3 7 L11 7"/></svg>
  if (kind === 'lock')  return <svg {...props}><rect x={2.5} y={6} width={9} height={6} rx={1}/><path d="M4.5 6 L4.5 4 Q4.5 2 7 2 Q9.5 2 9.5 4 L9.5 6"/></svg>
  return null
}

function Action({ label, hint, primary, onClick }: { label: string; hint?: string; primary?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 12px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      background: primary ? 'var(--accent)' : 'var(--bg-1)',
      color: primary ? '#061735' : 'var(--fg-1)',
      border: primary ? 'none' : '1px solid var(--line)',
      borderRadius: 6, cursor: 'pointer',
      fontSize: 13, fontWeight: 500,
      fontFamily: 'Geist, system-ui, sans-serif',
    }}>
      <span>{label}</span>
      {hint && <span style={{
        fontSize: 10, padding: '1px 5px', borderRadius: 3,
        background: primary ? 'rgba(6,23,53,0.18)' : 'var(--bg-2)',
        color: primary ? '#061735' : 'var(--fg-3)',
        fontFamily: 'Geist Mono, ui-monospace, monospace',
      }}>{hint}</span>}
    </button>
  )
}

function Wavebox({ vlog, thread, color, currentT, setCurrentT, playing, setPlaying, setAudioEl }: {
  vlog: Vlog; thread: Thread; color: string
  currentT: number; setCurrentT: (n: number) => void
  playing: boolean; setPlaying: (b: boolean) => void
  setAudioEl: (el: HTMLAudioElement | null) => void
}) {
  // Segment toggle — when on, plays just the thread's span as a
  // separately-generated MP3. Lazy: requests audio segment on first
  // click, caches presigned URL.
  const [segmentMode, setSegmentMode] = useState(false)
  const [segmentUrl, setSegmentUrl] = useState<string | null>(null)
  const [segmentLoading, setSegmentLoading] = useState(false)
  const [segmentError, setSegmentError] = useState<string | null>(null)

  const requestSegment = async () => {
    if (segmentUrl) { setSegmentMode(true); return }
    setSegmentLoading(true)
    setSegmentError(null)
    try {
      const r = await fetch(`/api/v2/threads/${thread.id}/audio-segment`, { credentials: 'include' })
      const d: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setSegmentUrl(d.url)
      setSegmentMode(true)
    } catch (e: any) {
      setSegmentError(String(e?.message || e).slice(0, 200))
    } finally {
      setSegmentLoading(false)
    }
  }

  const N = 240
  const heights = useMemo(() => {
    const h: number[] = []
    for (let i = 0; i < N; i++) {
      const env = 0.3 + 0.5 * Math.abs(Math.sin(i * 0.04))
      const noise = (Math.sin(i * 1.7) * 0.5 + Math.sin(i * 3.1) * 0.3 + Math.sin(i * 0.9) * 0.2) * 0.5 + 0.5
      h.push(Math.max(0.08, Math.min(1, env * 0.55 + noise * 0.55)))
    }
    return h
  }, [])
  const dur = vlog.duration_sec ?? 1
  const spanStartPct = thread.transcript_span_start != null ? (thread.transcript_span_start / dur) : null
  const spanEndPct = thread.transcript_span_end != null ? (thread.transcript_span_end / dur) : null
  const playedPct = currentT / dur

  return (
    <div style={{ padding: 20, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
        <button onClick={() => {
          const a = document.getElementById('thread-audio') as HTMLAudioElement | null
          if (!a) return
          if (a.paused) { a.play(); setPlaying(true) } else { a.pause(); setPlaying(false) }
        }} style={{
          width: 40, height: 40, padding: 0,
          background: color, color: 'var(--bg)', border: 'none', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          {playing
            ? <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="3" y="2.5" width="2.5" height="9"/><rect x="8.5" y="2.5" width="2.5" height="9"/></svg>
            : <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><polygon points="3.5,2 11.5,7 3.5,12"/></svg>}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, color: 'var(--fg-3)', letterSpacing: 0.4,
            fontFamily: 'Geist Mono, ui-monospace, monospace',
            marginBottom: 2, textTransform: 'uppercase',
          }}>Media moment</div>
          <div style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {vlog.original_filename ?? vlog.id}
          </div>
        </div>
        <span style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'Geist Mono, ui-monospace, monospace' }}>
          {formatMmSs(currentT)} / {formatMmSs(dur)}
        </span>
      </div>

      <div style={{ position: 'relative', height: 60, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
        {heights.map((h, i) => {
          const t = i / N
          const inSpan = spanStartPct != null && spanEndPct != null && t >= spanStartPct && t <= spanEndPct
          const played = t < playedPct
          const bg = inSpan ? color
            : played ? `color-mix(in srgb, ${color} 60%, var(--fg-5))`
            : 'var(--bg-4)'
          return (
            <div key={i} style={{
              flex: 1, height: `${h * 100}%`,
              background: bg, borderRadius: 1,
              boxShadow: inSpan ? `0 0 3px ${color}80` : 'none',
            }}/>
          )
        })}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 8,
        fontSize: 9, color: 'var(--fg-4)',
        fontFamily: 'Geist Mono, ui-monospace, monospace', letterSpacing: 0.3,
      }}>
        <span>00:00</span>
        {thread.transcript_span_start != null && <span style={{ color, fontWeight: 500 }}>{formatMmSs(thread.transcript_span_start)}</span>}
        {thread.transcript_span_end != null && <span style={{ color, fontWeight: 500 }}>{formatMmSs(thread.transcript_span_end)}</span>}
        <span>{formatMmSs(dur)}</span>
      </div>

      {/* Segment toggle — play thread's span as a standalone audio clip
          (generated on first click via FFmpeg + R2 cache). Hidden when
          the thread has no computed span (operator must re-extract). */}
      {thread.transcript_span_start != null && thread.transcript_span_end != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <button onClick={() => {
            if (segmentMode) { setSegmentMode(false); return }
            requestSegment()
          }} disabled={segmentLoading} style={{
            padding: '6px 12px', fontSize: 11,
            background: segmentMode ? color : 'var(--bg-2)',
            color: segmentMode ? 'var(--bg)' : 'var(--fg-1)',
            border: `1px solid ${segmentMode ? color : 'var(--line)'}`,
            borderRadius: 5, cursor: segmentLoading ? 'wait' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {segmentLoading ? '◌ Generating segment…' : segmentMode ? '◉ Thread segment only' : '▶ Thread segment only'}
          </button>
          {segmentUrl && !segmentLoading && (
            <a href={segmentUrl} download={`thread-${thread.id.slice(0, 12)}.mp3`} style={{
              fontSize: 10, color: 'var(--fg-3)',
              fontFamily: 'Geist Mono, ui-monospace, monospace',
              textDecoration: 'none', letterSpacing: 0.4, textTransform: 'uppercase',
            }}>Download mp3 →</a>
          )}
          {segmentError && <span style={{ fontSize: 10, color: 'var(--err)' }}>{segmentError}</span>}
        </div>
      )}

      {vlog.playback_url && (
        <audio
          id="thread-audio"
          ref={(el) => setAudioEl(el)}
          src={segmentMode && segmentUrl ? segmentUrl : vlog.playback_url}
          preload="metadata"
          onTimeUpdate={(e) => setCurrentT((e.target as HTMLAudioElement).currentTime)}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          style={{ display: 'none' }}
        />
      )}
    </div>
  )
}

function SectionBlock({ label, count, meta, children }: { label: string; count?: string; meta?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        paddingBottom: 10, marginBottom: 14,
        borderBottom: '1px solid var(--line)',
      }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--fg-1)', letterSpacing: '-0.2px' }}>
          {label}
          {count && <span style={{
            marginLeft: 10, fontSize: 11, color: 'var(--fg-3)',
            fontFamily: 'Geist Mono, ui-monospace, monospace', letterSpacing: 0.3,
          }}>{count}</span>}
        </h2>
        {meta && <span style={{
          fontSize: 10, color: 'var(--fg-4)',
          textTransform: 'uppercase', letterSpacing: 0.6,
          fontFamily: 'Geist Mono, ui-monospace, monospace',
        }}>{meta}</span>}
      </div>
      {children}
    </section>
  )
}

function TranscriptSpan({ window, keyPhrases, color, spanStart, spanEnd, onSeek }: {
  window: { pre_words: Word[]; span_words: Word[]; post_words: Word[] }
  keyPhrases: string[]; color: string
  spanStart: number | null; spanEnd: number | null
  onSeek: (t: number) => void
}) {
  const pre = window.pre_words.map(w => w.word).join(' ')
  const spanText = window.span_words.map(w => w.word).join(' ')
  const post = window.post_words.map(w => w.word).join(' ')
  if (!spanStart || !spanEnd || (window.pre_words.length === 0 && window.span_words.length === 0 && window.post_words.length === 0)) {
    return <EmptyHint>Transcript window not yet available. Span timestamps will populate after the next re-extraction.</EmptyHint>
  }
  return (
    <div style={{ padding: '20px 22px', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8 }}>
      {pre && (
        <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--fg-4)', lineHeight: 1.65 }}>
          <span style={{ display: 'inline-block', width: 50, color: 'var(--fg-4)', fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 11 }}>
            {formatMmSs(window.pre_words[0]?.start_time ?? spanStart)}
          </span>
          {pre}
        </p>
      )}
      <div style={{
        fontSize: 10, color, letterSpacing: 1.2, textTransform: 'uppercase',
        fontFamily: 'Geist Mono, ui-monospace, monospace',
        margin: '6px 0', cursor: 'pointer',
      }} onClick={() => onSeek(spanStart)}>
        ── Thread begins · {formatMmSs(spanStart)} ──
      </div>
      <p style={{ margin: '8px 0', fontSize: 16, color: 'var(--fg-1)', lineHeight: 1.7 }}>
        <span style={{ display: 'inline-block', width: 50, color: 'var(--fg-3)', fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 11, cursor: 'pointer' }} onClick={() => onSeek(spanStart)}>
          {formatMmSs(spanStart)}
        </span>
        <Highlighted text={spanText} phrases={keyPhrases} color={color} underline/>
      </p>
      <div style={{
        fontSize: 10, color, letterSpacing: 1.2, textTransform: 'uppercase',
        fontFamily: 'Geist Mono, ui-monospace, monospace',
        margin: '6px 0',
      }}>
        ── Thread ends · {formatMmSs(spanEnd)} ──
      </div>
      {post && (
        <p style={{ margin: '14px 0 0', fontSize: 14, color: 'var(--fg-4)', lineHeight: 1.65 }}>
          <span style={{ display: 'inline-block', width: 50, color: 'var(--fg-4)', fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 11 }}>
            {formatMmSs(spanEnd)}
          </span>
          {post}
        </p>
      )}
    </div>
  )
}

function ClusterContext({ cluster, siblings, currentId, color }: {
  cluster: Cluster
  siblings: { id: string; topic: string; take: string | null; extracted_at: string; strength: number | null; vlog_id: string }[]
  currentId: string; color: string
}) {
  return (
    <div style={{
      padding: 22, background: 'var(--bg-1)', border: '1px solid var(--line)',
      borderLeft: `3px solid ${color}`, borderRadius: 8,
      display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 22,
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }}/>
          <span style={{ fontSize: 17, fontWeight: 500, color: 'var(--fg)', letterSpacing: '-0.2px' }}>
            {cluster.abstracted_topic ?? cluster.topic}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { id: currentId, marker: 'YOU ARE HERE', take: null as string | null, topic: cluster.topic, current: true },
            ...siblings.slice(0, 3).map(s => ({ id: s.id, marker: formatDate(s.extracted_at).toUpperCase(), take: s.take, topic: s.topic, current: false })),
          ].map((s, i) => (
            <Link key={s.id + '-' + i} href={`/thread/${s.id}`} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              background: s.current ? 'var(--bg-2)' : 'var(--bg-1)',
              border: `1px solid ${s.current ? color : 'var(--line)'}`,
              borderRadius: 6, textDecoration: 'none',
            }}>
              <span style={{
                width: 24, height: 24, borderRadius: 4,
                background: s.current ? color : 'var(--bg-3)',
                color: s.current ? 'var(--bg)' : 'var(--fg-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 600,
                fontFamily: 'Geist Mono, ui-monospace, monospace',
              }}>0{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {truncate(s.take ?? s.topic, 60)}
                </div>
                <div style={{ fontSize: 9, color: 'var(--fg-4)', letterSpacing: 0.4, fontFamily: 'Geist Mono, ui-monospace, monospace', textTransform: 'uppercase', marginTop: 2 }}>
                  {s.marker}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ClusterRadar color={color} siblingCount={Math.max(1, siblings.length + 1)}/>
        <Link href={`/cluster/${cluster.id}`} style={{
          padding: '10px 14px',
          background: 'var(--bg-2)', border: '1px solid var(--line)',
          borderRadius: 6, textDecoration: 'none',
          color: 'var(--fg-1)', fontSize: 13, textAlign: 'center',
        }}>Open cluster →</Link>
      </div>
    </div>
  )
}

function ClusterRadar({ color, siblingCount }: { color: string; siblingCount: number }) {
  const n = Math.min(8, Math.max(2, siblingCount))
  const radius = 50, cx = 60, cy = 60
  const nodes = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius }
  })
  return (
    <svg viewBox="0 0 120 120" width="100%" height={120} style={{ background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--line)' }}>
      {nodes.map((p, i) => <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={`color-mix(in srgb, ${color} 30%, transparent)`} strokeWidth={0.6}/>)}
      {nodes.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} opacity={0.85}/>)}
      <circle cx={cx} cy={cy} r={9} fill={color}/>
      <circle cx={cx} cy={cy} r={18} fill={color} opacity={0.15}/>
    </svg>
  )
}

function RailCard({ label, more, children }: { label: string; more: string | null; children: React.ReactNode }) {
  return (
    <div style={{ padding: 18, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 500, color: 'var(--fg-1)', letterSpacing: '-0.1px' }}>{label}</h3>
        {more && <span style={{
          fontSize: 10, color: 'var(--fg-3)', letterSpacing: 0.4,
          fontFamily: 'Geist Mono, ui-monospace, monospace', textTransform: 'uppercase',
        }}>{more} →</span>}
      </div>
      {children}
    </div>
  )
}

function EntityChip({ entity }: { entity: { id: string; name: string; entity_type: string; mention_count: number | null } }) {
  const initials = entity.name.split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) || '?'
  const typeColor: Record<string, string> = {
    person: 'var(--t-5)', place: 'var(--t-3)', concept: 'var(--t-2)',
    tool: 'var(--t-6)', project: 'var(--t-4)', theme: 'var(--t-8)', reference: 'var(--t-1)',
  }
  const c = typeColor[entity.entity_type] ?? 'var(--fg-3)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px 4px 4px',
      background: 'var(--bg-2)', border: '1px solid var(--line)',
      borderRadius: 999,
      fontSize: 11, color: 'var(--fg-1)',
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        background: `color-mix(in srgb, ${c} 18%, var(--bg-3))`,
        color: c, fontSize: 9, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Geist Mono, ui-monospace, monospace',
      }}>{initials}</span>
      <span>{entity.name}</span>
      {entity.mention_count != null && entity.mention_count > 1 && (
        <span style={{ color: 'var(--fg-4)', fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 10 }}>·{entity.mention_count}</span>
      )}
    </span>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '12px 14px', background: 'var(--bg-2)',
      border: '1px dashed var(--line-1)', borderRadius: 6,
      fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.55,
    }}>{children}</div>
  )
}

function Prov({ label, value, mono, link, linkText }: { label: string; value: string; mono?: boolean; link?: string; linkText?: string }) {
  return (
    <div>
      <div style={{
        fontSize: 9, color: 'var(--fg-4)',
        textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500,
        fontFamily: 'Geist Mono, ui-monospace, monospace',
        marginBottom: 3,
      }}>{label}</div>
      <div style={{
        fontSize: 12, color: 'var(--fg-1)',
        fontFamily: mono ? 'Geist Mono, ui-monospace, monospace' : 'Geist, system-ui, sans-serif',
        wordBreak: 'break-all',
      }}>
        {link
          ? <Link href={link} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{linkText ?? value}</Link>
          : value}
      </div>
    </div>
  )
}

function Highlighted({ text, phrases, color, underline }: { text: string; phrases: string[]; color: string; underline?: boolean }) {
  if (!phrases.length) return <>{text}</>
  const sorted = [...phrases].sort((a, b) => b.length - a.length).filter(p => p && p.length >= 3)
  if (!sorted.length) return <>{text}</>
  let parts: (string | JSX.Element)[] = [text]
  for (const phrase of sorted) {
    const next: typeof parts = []
    const re = new RegExp(escapeRegex(phrase), 'i')
    for (const p of parts) {
      if (typeof p !== 'string') { next.push(p); continue }
      let remaining = p
      while (true) {
        const m = remaining.match(re)
        if (!m || m.index == null) { next.push(remaining); break }
        next.push(remaining.slice(0, m.index))
        next.push(<mark key={Math.random()} style={{
          background: underline ? 'transparent' : `linear-gradient(180deg, transparent 60%, color-mix(in srgb, ${color} 35%, transparent) 60%)`,
          color: 'var(--fg)',
          padding: underline ? 0 : '0 2px',
          borderBottom: underline ? `2px solid ${color}` : 'none',
        }}>{m[0]}</mark>)
        remaining = remaining.slice(m.index + m[0].length)
      }
    }
    parts = next
  }
  return <>{parts}</>
}

// Pure helpers
function truncate(s: string | null, n: number): string { if (!s) return ''; return s.length > n ? s.slice(0, n - 1) + '…' : s }
function headlineText(t: Thread): string {
  if (t.take && t.take.length > 12) return t.take
  if (t.key_quotes.length > 0) return t.key_quotes.reduce((a, b) => (a.length > b.length ? a : b))
  return t.topic
}
function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function formatFullDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso); if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function formatMmSs(s: number): string { if (!isFinite(s) || s < 0) return '0:00'; const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, '0')}` }
function formatDuration(s: number): string { if (!isFinite(s) || s < 0) return '—'; const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}` }
function escapeRegex(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function insightKindLabel(k: string): string {
  return ({ name: 'Name', framework: 'Framework', parallel: 'Parallel', counter_position: 'Counter', evidence: 'Evidence', gap_question: 'Gap' } as Record<string, string>)[k] || k
}
function renderInsightBody(body: string): string {
  const escaped = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong style="color: var(--fg); font-weight: 500;">$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>')
}
