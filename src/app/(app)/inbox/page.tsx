'use client'

/**
 * Inbox — what needs your attention. Triage queue for the operator.
 *
 * Five sections, each only rendered if it has items:
 *   - Surfaced (the system noticed something)
 *   - Ripening (clusters past 65, ready or nearly ready to produce)
 *   - Processing (vlogs mid-pipeline)
 *   - Failed (vlogs that need a retry)
 *   - Drafts (productions in progress)
 *
 * Hero shows the total count + a "nothing pending" empty state when
 * everything's caught up.
 *
 * Data: GET /api/v2/inbox.
 */

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'
import { truncate, formatDate, insightKindLabel, renderInsightBody } from '@/components/threadkit'

interface SurfacedRow { id: string; subtype: string; body: string; body_html: string | null; topic_color: string | null; surfaced_at: string; cluster_id: string | null; thread_id: string | null }
interface RipeningRow { id: string; topic: string; abstracted_topic: string | null; ripeness_score: number; state: string; thread_count: number; gap_question: string | null }
interface ProcessingRow { id: string; original_filename: string | null; pipeline_status: string; recorded_at: string | null; uploaded_at: string }
interface FailedRow extends ProcessingRow { pipeline_error: string | null }
interface DraftRow { id: string; name: string; tagline: string | null; blurb: string | null; state: string; last_activity_at: string | null }

interface Payload {
  surfaced: SurfacedRow[]
  ripening: RipeningRow[]
  processing: ProcessingRow[]
  failed: FailedRow[]
  drafts: DraftRow[]
  counts: { surfaced: number; ripening: number; processing: number; failed: number; drafts: number; total: number }
}

export default function InboxPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    fetch('/api/v2/inbox', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: any) => setData(d as Payload))
      .catch(e => setError(String(e?.message || e)))
  }
  useEffect(load, [])

  const dismiss = async (id: string) => {
    try {
      await fetch(`/api/v2/timeline?surfaced_id=${encodeURIComponent(id)}`, {
        method: 'DELETE', credentials: 'include',
      })
    } catch {}
    load()
  }

  if (error) return (
    <Shell>
      <div style={{ padding: 40, color: 'var(--t-terra)' }}>Error: {error}</div>
    </Shell>
  )

  return (
    <Shell>
      {/* Hero */}
      <section className="canon-reveal d1" style={{ padding: '40px 0 32px' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
          textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 20,
          display: 'inline-flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: data && data.counts.total > 0 ? 'var(--sig)' : 'var(--fg-4)',
            boxShadow: data && data.counts.total > 0 ? '0 0 8px var(--sig-glow)' : 'none',
            animation: data && data.counts.total > 0 ? 'canon-pulse 2.4s ease-in-out infinite' : undefined,
          }}/>
          The triage · what needs you
        </div>
        <h1 style={{
          fontFamily: 'var(--font-body)', fontWeight: 400,
          fontSize: 68, lineHeight: 1.0, letterSpacing: '-2.6px',
          color: 'var(--fg)', margin: '0 0 22px', textWrap: 'balance',
        }}>
          Inbox<span style={{ color: 'var(--sig)' }}>.</span>
        </h1>
        <p style={{
          fontSize: 17, lineHeight: 1.55, color: 'var(--fg-2)',
          maxWidth: 620, letterSpacing: '-0.15px', margin: 0,
        }}>
          What the system surfaced, what's ripening, what's still processing, what failed,
          what's drafting. Triage from here.
        </p>

        {data && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24,
            paddingTop: 28, marginTop: 28, borderTop: '1px solid var(--line)',
          }}>
            <StatCell n={data.counts.surfaced}   l="Surfaced"   onClick={() => scrollTo('surfaced')}/>
            <StatCell n={data.counts.ripening}   l="Ripening"   onClick={() => scrollTo('ripening')}/>
            <StatCell n={data.counts.processing} l="Processing" onClick={() => scrollTo('processing')}/>
            <StatCell n={data.counts.failed}     l="Failed"     warn={data.counts.failed > 0} onClick={() => scrollTo('failed')}/>
            <StatCell n={data.counts.drafts}     l="Drafts"     onClick={() => scrollTo('drafts')}/>
          </div>
        )}
      </section>

      {!data && <div style={{ padding: 40, color: 'var(--fg-3)' }}>Loading…</div>}

      {data && data.counts.total === 0 && (
        <div className="canon-reveal d2" style={{
          padding: '60px 32px',
          border: '1px dashed var(--line-2)',
          borderRadius: 14, background: 'var(--bg-1)',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-body)', fontSize: 32, fontWeight: 400,
            letterSpacing: '-1px', color: 'var(--fg)', margin: '0 0 14px',
          }}>
            All clear.
          </h2>
          <p style={{ color: 'var(--fg-2)', maxWidth: 480, margin: '0 auto', lineHeight: 1.55 }}>
            Nothing pending. The system has nothing to surface, no clusters are nearly ripe,
            and no vlogs are mid-flight. Drop a new vlog or open Studio to keep cultivating.
          </p>
        </div>
      )}

      {data && data.counts.total > 0 && (
        <div className="canon-reveal d2" style={{ display: 'flex', flexDirection: 'column', gap: 36, paddingBottom: 48 }}>

          {/* Surfaced */}
          {data.surfaced.length > 0 && (
            <Section id="surfaced" title="Surfaced" count={data.surfaced.length} meta="the system noticed">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.surfaced.map(s => (
                  <SurfacedCard key={s.id} card={s} onDismiss={() => dismiss(s.id)}/>
                ))}
              </div>
            </Section>
          )}

          {/* Ripening */}
          {data.ripening.length > 0 && (
            <Section id="ripening" title="Ripening" count={data.ripening.length} meta="65+ ripe · ready or nearly">
              <div style={{
                display: 'grid', gap: 10,
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              }}>
                {data.ripening.map(c => <RipeningCard key={c.id} cluster={c}/>)}
              </div>
            </Section>
          )}

          {/* Processing */}
          {data.processing.length > 0 && (
            <Section id="processing" title="Processing" count={data.processing.length} meta="mid-pipeline">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.processing.map(v => <ProcessingRow key={v.id} vlog={v}/>)}
              </div>
            </Section>
          )}

          {/* Failed */}
          {data.failed.length > 0 && (
            <Section id="failed" title="Failed" count={data.failed.length} meta="needs retry" warn>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.failed.map(v => <FailedRowCard key={v.id} vlog={v}/>)}
              </div>
            </Section>
          )}

          {/* Drafts */}
          {data.drafts.length > 0 && (
            <Section id="drafts" title="Drafts" count={data.drafts.length} meta="in progress">
              <div style={{
                display: 'grid', gap: 10,
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              }}>
                {data.drafts.map(p => <DraftCard key={p.id} draft={p}/>)}
              </div>
            </Section>
          )}
        </div>
      )}
    </Shell>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────

function scrollTo(id: string) {
  document.getElementById(`inbox-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function StatCell({ n, l, warn, onClick }: { n: number; l: string; warn?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      background: 'none', border: 0, padding: 0,
      textAlign: 'left', cursor: onClick && n > 0 ? 'pointer' : 'default',
      opacity: n === 0 ? 0.55 : 1,
    }}>
      <span style={{
        fontFamily: 'var(--font-body)', fontWeight: 300,
        fontSize: 36, letterSpacing: '-1.4px',
        color: warn && n > 0 ? 'var(--t-terra)' : n > 0 ? 'var(--fg)' : 'var(--fg-3)',
        lineHeight: 1, fontVariantNumeric: 'tabular-nums',
      }}>{n.toLocaleString()}</span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9.5,
        letterSpacing: 1.8, textTransform: 'uppercase',
        color: 'var(--fg-3)', fontWeight: 500,
      }}>{l}</span>
    </button>
  )
}

function Section({ id, title, count, meta, warn, children }: {
  id: string; title: string; count: number; meta?: string; warn?: boolean; children: React.ReactNode
}) {
  return (
    <section id={`inbox-${id}`} className="canon-section">
      <div className="canon-section-head">
        <h2 style={{ color: warn ? 'var(--t-terra)' : undefined }}>
          {title} <span className="meta">· {count}</span>
        </h2>
        {meta && <div className="meta">{meta}</div>}
      </div>
      {children}
    </section>
  )
}

function SurfacedCard({ card, onDismiss }: { card: SurfacedRow; onDismiss: () => void }) {
  const subtype = (card.subtype as 'cluster_ready' | 'adjacent_insight' | 'gap_question' | 'auto_link') || 'adjacent_insight'
  const topicTok = subtype === 'cluster_ready' ? '--sig'
    : subtype === 'gap_question' ? '--t-ochre'
    : subtype === 'auto_link' ? '--t-violet'
    : '--t-violet'
  const href = card.cluster_id ? `/studio/${card.cluster_id}` : card.thread_id ? `/thread/${card.thread_id}` : null

  return (
    <div className="tcard surfaced" style={{
      '--topic': `var(${topicTok})`,
      '--topic-soft': `color-mix(in srgb, var(${topicTok}) 8%, transparent)`,
      cursor: 'default',
    } as any}>
      <div className="t-header">
        <span className="topic-pill"><span className="type">Surfaced</span></span>
        <span className="t-status">{insightKindLabel(subtype)}</span>
        <span className="t-time">{formatDate(card.surfaced_at)}</span>
      </div>
      <div className="surfaced-body">
        <span className="surfaced-ico">
          <svg viewBox="0 0 16 16"><path d="M8 14 L8 2 M3 7 L8 2 L13 7"/></svg>
        </span>
        <div className="surfaced-text" dangerouslySetInnerHTML={{ __html: card.body_html || renderInsightBody(card.body) }}/>
      </div>
      <div className="surfaced-cta">
        {href && (
          <Link href={href} className="hot">{card.cluster_id ? 'Open cluster →' : 'Open thread →'}</Link>
        )}
        <button onClick={onDismiss} style={{
          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
          padding: '7px 13px', borderRadius: 6,
          border: '1px solid var(--line-2)',
          color: 'var(--fg-1)', background: 'var(--bg-2)',
          cursor: 'pointer', transition: 'all .15s',
        }}>Dismiss</button>
      </div>
    </div>
  )
}

function RipeningCard({ cluster }: { cluster: RipeningRow }) {
  const topicName = cluster.abstracted_topic ?? cluster.topic
  const color = topicColor(topicName)
  const ripe = Math.round(cluster.ripeness_score)
  const ready = ripe >= 70
  return (
    <Link href={`/studio/${cluster.id}`} className="tcard" style={{
      '--topic': color,
      '--topic-soft': `color-mix(in srgb, ${color} 8%, transparent)`,
      borderLeft: `3px solid ${color}`,
      display: 'flex', flexDirection: 'column', gap: 10,
    } as any}>
      <div className="t-header">
        <span className="topic-pill"><span className="type">Cluster</span></span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5,
          letterSpacing: 1.6, textTransform: 'uppercase',
          color: ready ? 'var(--sig)' : 'var(--fg-3)',
          padding: '3px 9px', borderRadius: 100,
          background: ready ? 'var(--sig-soft)' : 'var(--bg-2)',
          border: `1px solid ${ready ? 'color-mix(in srgb, var(--sig) 35%, transparent)' : 'var(--line-1)'}`,
        }}>{cluster.state}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: ready ? 'var(--sig)' : 'var(--fg-1)', fontWeight: 500 }}>
          {ripe} ripe
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 500,
        color: 'var(--fg)', letterSpacing: '-0.3px', lineHeight: 1.3,
      }}>
        {truncate(topicName, 80)}
      </div>
      <div style={{ height: 3, background: 'var(--line-1)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${ripe}%`,
          background: ready ? 'var(--sig)' : color,
          boxShadow: ready ? '0 0 6px var(--sig-glow)' : `0 0 6px ${color}80`,
        }}/>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: 0.4 }}>
        {cluster.thread_count} threads
      </div>
      {cluster.gap_question && (
        <div style={{
          padding: '10px 12px',
          background: 'var(--bg-2)',
          border: '1px dashed color-mix(in srgb, var(--sig) 30%, transparent)',
          borderRadius: 6,
          fontSize: 12, color: 'var(--fg-2)',
          fontStyle: 'italic', lineHeight: 1.5,
        }}>
          {truncate(cluster.gap_question, 120)}
        </div>
      )}
    </Link>
  )
}

function ProcessingRow({ vlog }: { vlog: ProcessingRow }) {
  return (
    <Link href={`/vlog/${vlog.id}`} style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 16px',
      background: 'var(--bg-1)',
      border: '1px solid var(--line-1)',
      borderLeft: '2px solid var(--t-ochre)',
      borderRadius: '0 10px 10px 0',
      textDecoration: 'none', color: 'inherit',
      transition: 'all .15s',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: 'var(--t-ochre)',
        boxShadow: '0 0 6px color-mix(in srgb, var(--t-ochre) 60%, transparent)',
        animation: 'canon-pulse 2s ease-in-out infinite',
      }}/>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10,
        letterSpacing: 1.4, textTransform: 'uppercase',
        color: 'var(--t-ochre)', flexShrink: 0,
      }}>{vlog.pipeline_status.replace(/_/g, ' ')}</span>
      <span style={{
        fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg-1)',
        flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{vlog.original_filename || 'Untitled vlog'}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', flexShrink: 0 }}>
        {formatDate(vlog.uploaded_at)}
      </span>
    </Link>
  )
}

function FailedRowCard({ vlog }: { vlog: FailedRow }) {
  return (
    <Link href={`/vlog/${vlog.id}`} style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '12px 16px',
      background: 'rgba(230,99,74,0.06)',
      border: '1px solid var(--t-terra)',
      borderRadius: 10,
      textDecoration: 'none', color: 'inherit',
      transition: 'all .15s',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10,
        letterSpacing: 1.4, textTransform: 'uppercase',
        color: 'var(--t-terra)', flexShrink: 0, marginTop: 2,
      }}>Failed</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg-1)',
          marginBottom: 4,
        }}>{vlog.original_filename || 'Untitled vlog'}</div>
        {vlog.pipeline_error && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: 0.3, lineHeight: 1.45 }}>
            {truncate(vlog.pipeline_error, 200)}
          </div>
        )}
      </div>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10,
        color: 'var(--t-terra)', letterSpacing: 1.4, textTransform: 'uppercase',
        flexShrink: 0, padding: '4px 9px',
        border: '1px solid var(--t-terra)', borderRadius: 100,
      }}>Open ▸</span>
    </Link>
  )
}

function DraftCard({ draft }: { draft: DraftRow }) {
  return (
    <Link href={`/productions/${draft.id}`} className="tcard" style={{
      '--topic': 'var(--t-plum)',
      '--topic-soft': 'color-mix(in srgb, var(--t-plum) 8%, transparent)',
      borderLeft: '3px solid var(--t-plum)',
      display: 'flex', flexDirection: 'column', gap: 10,
    } as any}>
      <div className="t-header">
        <span className="topic-pill"><span className="type">Production</span></span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5,
          letterSpacing: 1.6, textTransform: 'uppercase',
          color: 'var(--fg-3)',
          padding: '3px 9px', borderRadius: 100,
          background: 'var(--bg-2)', border: '1px solid var(--line-1)',
        }}>{draft.state}</span>
        {draft.last_activity_at && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>
            {formatDate(draft.last_activity_at)}
          </span>
        )}
      </div>
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 500,
        color: 'var(--fg)', letterSpacing: '-0.3px', lineHeight: 1.3,
      }}>{draft.name || 'Untitled'}</div>
      {(draft.tagline || draft.blurb) && (
        <div style={{
          fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {draft.tagline || draft.blurb}
        </div>
      )}
    </Link>
  )
}
