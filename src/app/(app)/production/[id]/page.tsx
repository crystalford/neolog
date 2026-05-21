'use client'

/**
 * Production detail (singular /production/[id]) — the draft view.
 *
 * Distinct from /productions/[id] which serves Pack Rats-style
 * project containers from the `projects` table. This route serves
 * actual production artifacts from the `productions` table — the
 * output of the production engine.
 *
 * Sections:
 *   1. Crumbs (Timeline / Productions / draft name)
 *   2. Hero — production-type pill + state pill + topic h1 + actions
 *   3. Two-column body — script editor (left) + source rail (right)
 *   4. Provenance + footer
 *
 * Editor is a plain textarea for v1. Operator edits → PATCH saves
 * (debounced). State actions: Mark ready / Mark produced / Publish.
 */

export const runtime = 'edge'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'
import { truncate, formatFullDate } from '@/components/threadkit'

interface Production {
  id: string
  production_type: string
  source_kind: string
  source_id: string
  state: string
  state_changed_at: string
  script_text: string | null
  script_version: number
  visibility: string
  published_to: string | null
  produced_at: string | null
  created_at: string
  updated_at: string
  prompt_version: string | null
}

interface ThreadSource {
  id: string; topic: string; take: string | null; abstracted_topic: string | null
  strength: number | null; transcript_span_start: number | null; transcript_span_end: number | null
  vlog_id: string; vlog_filename: string | null
}
interface ClusterSource {
  id: string; topic: string; abstracted_topic: string | null
  take: string | null; ripeness_score: number; state: string
  threads: { id: string; topic: string; take: string | null; strength: number | null }[]
}
type Source = ThreadSource | ClusterSource | null

const TYPE_LABELS: Record<string, string> = {
  x_post: 'X post',
  x_thread: 'X thread',
  micro_essay: 'Micro-essay',
  article: 'Article',
  clip: 'Clip',
  video_essay: 'Video essay',
  creative_work: 'Creative work',
}

export default function ProductionDraftPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [data, setData] = useState<{ production: Production; source: Source } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [script, setScript] = useState('')
  const [savedScript, setSavedScript] = useState('')
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = () => {
    fetch(`/api/v2/productions/${params.id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: any) => {
        setData(d)
        setScript(d.production.script_text ?? '')
        setSavedScript(d.production.script_text ?? '')
      })
      .catch(e => setError(String(e?.message || e)))
  }
  useEffect(load, [params.id])

  // Debounced auto-save (1.5s after last keystroke).
  useEffect(() => {
    if (!data) return
    if (script === savedScript) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSavingState('idle')
    saveTimer.current = setTimeout(async () => {
      setSavingState('saving')
      try {
        const r = await fetch(`/api/v2/productions/${params.id}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script_text: script }),
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        setSavedScript(script)
        setSavingState('saved')
        setTimeout(() => setSavingState(curr => curr === 'saved' ? 'idle' : curr), 1800)
      } catch {
        setSavingState('failed')
      }
    }, 1500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [script, savedScript, data, params.id])

  const setState = async (newState: string) => {
    try {
      const r = await fetch(`/api/v2/productions/${params.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      load()
    } catch (e: any) {
      alert(`State change failed: ${e?.message || e}`)
    }
  }

  const togglePublish = async () => {
    if (!data) return
    const next = data.production.visibility === 'public' ? 'private' : 'public'
    try {
      const r = await fetch(`/api/v2/productions/${params.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: next }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      load()
    } catch (e: any) {
      alert(`Publish toggle failed: ${e?.message || e}`)
    }
  }

  const deleteProd = async () => {
    if (!confirm('Delete this production? Soft-delete — can be restored later if needed.')) return
    try {
      const r = await fetch(`/api/v2/productions/${params.id}`, {
        method: 'DELETE', credentials: 'include',
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      router.push('/productions')
    } catch (e: any) {
      alert(`Delete failed: ${e?.message || e}`)
    }
  }

  if (error) return (
    <Shell>
      <Crumbs trail={[{ label: 'Timeline', href: '/' }, { label: 'Productions', href: '/productions' }, 'Error']}/>
      <div style={{ padding: 40, color: 'var(--t-terra)' }}>Error: {error}</div>
    </Shell>
  )
  if (!data) return (
    <Shell>
      <Crumbs trail={[{ label: 'Timeline', href: '/' }, { label: 'Productions', href: '/productions' }, '…']}/>
      <div style={{ padding: 40, color: 'var(--fg-3)' }}>Loading…</div>
    </Shell>
  )

  const { production: p, source } = data
  const typeLabel = TYPE_LABELS[p.production_type] || p.production_type
  const topicName =
    p.source_kind === 'thread'
      ? ((source as ThreadSource | null)?.abstracted_topic ?? (source as ThreadSource | null)?.topic ?? 'Production')
      : ((source as ClusterSource | null)?.abstracted_topic ?? (source as ClusterSource | null)?.topic ?? 'Production')
  const color = topicColor(topicName)
  const isPublic = p.visibility === 'public'

  return (
    <Shell>
      <div style={{ ['--topic' as any]: color } as React.CSSProperties}>
        <Crumbs
          trail={[
            { label: 'Timeline', href: '/' },
            { label: 'Productions', href: '/productions' },
            { label: truncate(`${typeLabel} · ${topicName}`, 60) },
          ]}
        />

        {/* Hero */}
        <section className="canon-detail-hero canon-reveal d2">
          <div>
            <div className="pills-row">
              <span className="topic-pill" style={{
                '--topic': color, '--topic-soft': `color-mix(in srgb, ${color} 12%, transparent)`,
              } as any}>
                <span className="type">{typeLabel}</span>
                <span className="sep">·</span>
                {p.source_kind === 'thread' ? 'from thread' : 'from cluster'}
              </span>
              <StatePill state={p.state}/>
              {isPublic && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 11px',
                  background: 'var(--sig-soft)',
                  border: '1px solid color-mix(in srgb, var(--sig) 35%, transparent)',
                  borderRadius: 100,
                  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.6,
                  textTransform: 'uppercase', fontWeight: 500, color: 'var(--sig)',
                }}>Public</span>
              )}
            </div>
            <h1 style={{ fontSize: 56, letterSpacing: '-1.8px' }}>{topicName}</h1>
            <div className="meta-strip">
              <span>Created <strong>{formatFullDate(p.created_at)}</strong></span>
              <span>Updated <strong>{formatFullDate(p.updated_at)}</strong></span>
              <span>v<strong>{p.script_version}</strong></span>
              {p.prompt_version && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.prompt_version}</span>}
            </div>
          </div>
          <div className="actions">
            {p.state === 'materializing' && (
              <button className="action primary" onClick={() => setState('script_ready')}>
                Mark ready
              </button>
            )}
            {p.state === 'script_ready' && (
              <button className="action primary" onClick={() => setState('produced')}>
                Mark produced
              </button>
            )}
            {p.state === 'produced' && (
              <button className="action primary" onClick={togglePublish}>
                {isPublic ? 'Unpublish' : 'Publish'}
              </button>
            )}
            {p.state === 'published' && (
              <a className="action primary" href={`/p/${p.id}`} target="_blank" rel="noreferrer">
                View public
              </a>
            )}
            <button className="action" onClick={togglePublish}>
              {isPublic ? 'Set private' : 'Set public'}
            </button>
            <button className="action" onClick={deleteProd} style={{ color: 'var(--t-terra)' }}>
              Delete
            </button>
          </div>
        </section>

        {/* Body grid */}
        <div className="canon-detail-body">
          <div className="canon-detail-main">
            <section className="canon-section">
              <div className="canon-section-head">
                <h2>Draft</h2>
                <div className="meta">
                  <SaveStatus state={savingState}/>
                  · v{p.script_version} · {script.split(/\s+/).filter(Boolean).length} words
                </div>
              </div>
              <textarea
                value={script}
                onChange={e => setScript(e.target.value)}
                spellCheck
                style={{
                  width: '100%', minHeight: 420,
                  padding: '20px 22px',
                  background: 'var(--bg-1)',
                  border: '1px solid var(--line-1)',
                  borderLeft: `2px solid ${color}`,
                  borderRadius: '0 12px 12px 0',
                  fontFamily: p.production_type === 'article' || p.production_type === 'micro_essay'
                    ? 'var(--font-body)'
                    : 'var(--font-body)',
                  fontSize: p.production_type === 'article' ? 17 : 15.5,
                  lineHeight: 1.7,
                  color: 'var(--fg)',
                  resize: 'vertical',
                  outline: 'none',
                }}
              />
            </section>

            <section className="canon-section">
              <div className="canon-section-head">
                <h2>Notes</h2>
                <div className="meta">iteration log — coming soon</div>
              </div>
              <div className="canon-empty-hint">
                Iteration history and operator notes on the draft will live here. For now, edits auto-save as v++ on the draft itself.
              </div>
            </section>
          </div>

          {/* Source rail */}
          <aside className="canon-detail-rail">
            <div className="rail-card">
              <div className="rc-head">
                <h3>Source · {p.source_kind}</h3>
              </div>
              {p.source_kind === 'thread' && source && (
                <ThreadSourceCard source={source as ThreadSource} color={color}/>
              )}
              {p.source_kind === 'cluster' && source && (
                <ClusterSourceCard source={source as ClusterSource} color={color}/>
              )}
              {!source && (
                <div className="canon-empty-hint" style={{ padding: 14, fontSize: 12 }}>
                  Source couldn't be loaded (deleted? renamed?).
                </div>
              )}
            </div>

            <div className="rail-card">
              <div className="rc-head"><h3>Engine</h3></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--fg-2)' }}>
                <div><span style={{ color: 'var(--fg-3)' }}>Model:</span> <strong style={{ color: 'var(--fg-1)' }}>{p.prompt_version?.split('·')[1]?.trim() || 'unknown'}</strong></div>
                <div><span style={{ color: 'var(--fg-3)' }}>Prompt:</span> <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.prompt_version?.split('·')[0]?.trim() || '—'}</span></div>
                <button
                  onClick={() => alert('Re-generate — coming next.')}
                  className="canon-btn ghost"
                  style={{ fontSize: 12, marginTop: 8 }}
                >
                  Re-generate draft
                </button>
              </div>
            </div>
          </aside>
        </div>

        {/* Provenance */}
        <section className="canon-prov-grid" style={{ marginTop: 32 }}>
          <ProvCell label="Type" value={typeLabel}/>
          <ProvCell label="State" value={p.state.replace(/_/g, ' ')}/>
          <ProvCell label="Version" value={`v${p.script_version}`}/>
          <ProvCell label="Visibility" value={p.visibility}/>
          <ProvCell label="Created" value={formatFullDate(p.created_at)}/>
          <ProvCell label="Updated" value={formatFullDate(p.updated_at)}/>
          <ProvCell label="Produced" value={p.produced_at ? formatFullDate(p.produced_at) : '—'}/>
          <ProvCell label="Production id" value={truncate(p.id, 22)} mono/>
        </section>

        <footer className="canon-detail-footer">
          <span>neolog · production {truncate(p.id, 22)}</span>
          <span/>
        </footer>
      </div>
    </Shell>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────

type CrumbItem = { label: string; href?: string } | string
function Crumbs({ trail }: { trail: CrumbItem[] }) {
  return (
    <div className="canon-crumbs">
      {trail.map((c, i) => {
        const isLast = i === trail.length - 1
        const item = typeof c === 'string' ? { label: c } : c
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
            {item.href && !isLast ? <Link href={item.href}>{item.label}</Link> : <span className={isLast ? 'here' : ''}>{item.label}</span>}
            {!isLast && <span className="sep">/</span>}
          </span>
        )
      })}
      <div className="spacer"/>
    </div>
  )
}

function StatePill({ state }: { state: string }) {
  const meta: Record<string, { color: string; label: string }> = {
    materializing: { color: 'var(--t-ochre)', label: 'Drafting' },
    script_ready:  { color: 'var(--sig)',     label: 'Script ready' },
    recording:     { color: 'var(--t-violet)',label: 'Recording' },
    producing:     { color: 'var(--t-violet)',label: 'Producing' },
    produced:      { color: 'var(--t-sage)',  label: 'Produced' },
    published:     { color: 'var(--sig)',     label: 'Published' },
    archived:      { color: 'var(--fg-3)',    label: 'Archived' },
  }
  const m = meta[state] || { color: 'var(--fg-3)', label: state }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 11px',
      background: `color-mix(in srgb, ${m.color} 10%, var(--bg-2))`,
      border: `1px solid color-mix(in srgb, ${m.color} 35%, var(--line-1))`,
      borderRadius: 100,
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.6,
      textTransform: 'uppercase', fontWeight: 500, color: m.color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.color, boxShadow: `0 0 6px ${m.color}` }}/>
      {m.label}
    </span>
  )
}

function SaveStatus({ state }: { state: 'idle' | 'saving' | 'saved' | 'failed' }) {
  if (state === 'saving') return <span style={{ color: 'var(--t-ochre)' }}>saving…</span>
  if (state === 'saved')  return <span style={{ color: 'var(--t-sage)' }}>saved</span>
  if (state === 'failed') return <span style={{ color: 'var(--t-terra)' }}>save failed</span>
  return <span style={{ color: 'var(--fg-4)' }}>idle</span>
}

function ProvCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="canon-prov-cell">
      <span className="l">{label}</span>
      <span className={`v ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  )
}

function ThreadSourceCard({ source, color }: { source: ThreadSource; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Link href={`/thread/${source.id}`} className="canon-sibling" style={{ '--c': color } as any}>
        <span className="dot"/>
        <span className="name">{truncate(source.take || source.topic, 80)}</span>
        <span className="strength">
          {[1,2,3,4,5].map(i => <span key={i} className={`pip ${i <= (source.strength ?? 0) ? 'on' : ''}`}/>)}
        </span>
      </Link>
      {source.vlog_filename && (
        <Link href={`/vlog/${source.vlog_id}`} style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)',
          letterSpacing: 0.4, textDecoration: 'none',
        }}>
          ↗ from vlog · {truncate(source.vlog_filename, 32)}
        </Link>
      )}
    </div>
  )
}

function ClusterSourceCard({ source, color }: { source: ClusterSource; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Link href={`/studio/${source.id}`} className="canon-sibling" style={{ '--c': color } as any}>
        <span className="dot"/>
        <span className="name">{truncate(source.abstracted_topic ?? source.topic, 60)}</span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--sig)',
          flexShrink: 0,
        }}>{Math.round(source.ripeness_score)} ripe</span>
      </Link>
      {source.threads.length > 0 && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-3)',
          letterSpacing: 0.4, paddingTop: 8, borderTop: '1px solid var(--line)',
        }}>
          {source.threads.length} threads in cluster
        </div>
      )}
    </div>
  )
}
