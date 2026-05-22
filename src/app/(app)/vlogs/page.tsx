'use client'

/**
 * Vlogs — the raw archive. Canon vocabulary extension (the design
 * pack covers Vlog DETAIL in 04-Vlog.html but not the list view, so
 * this surface extends the canon vocabulary).
 *
 * Hero (68px h1) + Capture CTA + 7-tab filter strip + search + bulk
 * select toolbar + auto-fill grid of canon vlog cards. Each card has:
 * thumbnail (16:9, topic-tinted gradient bg if no thumb), status pill,
 * filename, recorded date, duration, size, thread/clip count.
 *
 * Data: GET /api/v2/vlogs?limit=500
 * Bulk delete: POST /api/v2/vlogs/bulk-delete
 */

export const runtime = 'edge'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Shell from '@/components/Shell'
import { CapturePanel } from '@/components/CapturePanel'

interface VlogRow {
  id: string
  title: string | null
  original_filename: string | null
  file_size_bytes: number | null
  mime_type: string | null
  duration_seconds: number | null
  recorded_at: string | null
  uploaded_at: string
  thumbnail_url: string | null
  pipeline_status: string
  thread_count?: number
  clip_count?: number
  has_transcript?: 0 | 1 | boolean
}

type Filter = 'all' | 'today' | 'week' | 'processing' | 'complete' | 'archived' | 'failed'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'today',      label: 'Today' },
  { key: 'week',       label: 'This week' },
  { key: 'processing', label: 'Processing' },
  { key: 'complete',   label: 'Complete' },
  { key: 'archived',   label: 'B-roll' },
  { key: 'failed',     label: 'Failed' },
]

export default function VlogsPage() {
  const [vlogs, setVlogs] = useState<VlogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [deleting, setDeleting] = useState(false)
  const [actionNote, setActionNote] = useState<string | null>(null)
  const sp = useSearchParams()
  const [captureOpen, setCaptureOpen] = useState(sp?.get('capture') === 'open')
  useEffect(() => { setSelected(new Set()) }, [filter, query])

  const load = () => {
    setLoading(true)
    fetch('/api/v2/vlogs?limit=500', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { vlogs: [] })
      .then((d: any) => { setVlogs(d.vlogs || []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(load, [])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, today: 0, week: 0, processing: 0, complete: 0, archived: 0, failed: 0 }
    const now = Date.now()
    const dayMs = 86_400_000
    for (const v of vlogs) {
      c.all++
      const ts = v.recorded_at ? new Date(v.recorded_at).getTime() : new Date(v.uploaded_at).getTime()
      const ageDays = (now - ts) / dayMs
      if (ageDays < 1) c.today++
      if (ageDays < 7) c.week++
      if (['transcoding', 'transcribing', 'extracting', 'uploaded', 'thumbnail_pending'].includes(v.pipeline_status)) c.processing++
      else if (v.pipeline_status === 'complete') c.complete++
      else if (v.pipeline_status === 'archived') c.archived++
      else if (v.pipeline_status === 'failed') c.failed++
    }
    return c
  }, [vlogs])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const now = Date.now()
    const dayMs = 86_400_000
    return vlogs.filter(v => {
      if (q && !(v.original_filename ?? '').toLowerCase().includes(q)) return false
      if (filter === 'all') return true
      const ts = v.recorded_at ? new Date(v.recorded_at).getTime() : new Date(v.uploaded_at).getTime()
      const ageDays = (now - ts) / dayMs
      if (filter === 'today') return ageDays < 1
      if (filter === 'week') return ageDays < 7
      if (filter === 'processing') return ['transcoding', 'transcribing', 'extracting', 'uploaded', 'thumbnail_pending'].includes(v.pipeline_status)
      if (filter === 'complete') return v.pipeline_status === 'complete'
      if (filter === 'archived') return v.pipeline_status === 'archived'
      if (filter === 'failed') return v.pipeline_status === 'failed'
      return true
    })
  }, [vlogs, filter, query])

  const totalSize = useMemo(() => vlogs.reduce((s, v) => s + (v.file_size_bytes ?? 0), 0), [vlogs])
  const totalDuration = useMemo(() => vlogs.reduce((s, v) => s + (v.duration_seconds ?? 0), 0), [vlogs])

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const bulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} vlog${selected.size === 1 ? '' : 's'}? Removes R2 bytes too. Cannot be undone.`)) return
    setDeleting(true)
    setActionNote(null)
    try {
      const r = await fetch('/api/v2/vlogs/bulk-delete', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vlog_ids: Array.from(selected) }),
      })
      const d: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setActionNote(`Deleted ${d.deleted ?? selected.size} vlog${selected.size === 1 ? '' : 's'}.`)
      setSelected(new Set())
      load()
    } catch (e: any) {
      setActionNote(`Failed: ${e?.message || String(e)}`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Shell>
      {/* Hero */}
      <section className="canon-reveal d1" style={{ padding: '8px 0 32px' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
          textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 20,
          display: 'inline-flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 8px var(--sig-glow)' }}/>
          The raw archive · everything you've captured
        </div>
        <h1 style={{
          fontFamily: 'var(--font-body)', fontWeight: 400,
          fontSize: 68, lineHeight: 1.0, letterSpacing: '-2.6px',
          color: 'var(--fg)', margin: '0 0 22px', textWrap: 'balance',
        }}>
          Vlogs<span style={{ color: 'var(--fg-3)', fontWeight: 300 }}>,</span> in order<span style={{ color: 'var(--sig)' }}>.</span>
        </h1>
        <p style={{
          fontSize: 17, lineHeight: 1.55, color: 'var(--fg-2)',
          maxWidth: 620, letterSpacing: '-0.15px', marginBottom: 24,
        }}>
          Every recording you've dropped in. Newest first. Click any card for the full
          session — player, multi-track timeline, threads, transcript, the works.
        </p>

        {/* Stats strip */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24,
          paddingTop: 22, borderTop: '1px solid var(--line)',
        }}>
          <Stat n={vlogs.length} l="Total vlogs"/>
          <Stat n={Math.round(totalDuration / 60)} l="Minutes captured" suffix=" min"/>
          <Stat n={Math.round(totalSize / (1024 * 1024 * 1024) * 10) / 10} l="In R2" suffix=" GB"/>
          <Stat n={vlogs.filter(v => v.pipeline_status === 'complete').length} l="Extracted"/>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 28, flexWrap: 'wrap' }}>
          <button onClick={() => setCaptureOpen(o => !o)} className={`canon-btn ${captureOpen ? 'ghost' : 'primary'}`}>
            <span className="ico"><svg viewBox="0 0 14 14"><path d="M8 3 L8 11 M3 7 L8 3 L13 7"/></svg></span>
            {captureOpen ? 'Hide upload' : 'Drop new vlogs'}
          </button>
          <button onClick={load} className="canon-btn ghost">
            <span className="ico"><svg viewBox="0 0 14 14"><path d="M3 7a4 4 0 0 1 4-4 4 4 0 0 1 4 4 M3 7a4 4 0 0 0 4 4 4 4 0 0 0 4 -4 M11 3 L11 6 L8 6"/></svg></span>
            Refresh
          </button>
        </div>
      </section>

      {/* Inline Capture panel (replaces standalone /capture route) */}
      {captureOpen && (
        <div className="canon-reveal d2" style={{ marginBottom: 28 }}>
          <CapturePanel onUploaded={load}/>
        </div>
      )}

      {/* Tabs + search */}
      <div className="canon-reveal d2" style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 14,
        borderBottom: '1px solid var(--line)',
        paddingBottom: 18, marginBottom: 24,
      }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`canon-filter-chip ${filter === f.key ? 'active' : ''}`}>
              {f.label}
              <span className="n">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <input
          placeholder="Search filenames…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            padding: '7px 14px',
            background: 'var(--bg-2)',
            border: '1px solid var(--line-1)',
            borderRadius: 8,
            color: 'var(--fg-1)',
            fontSize: 12.5,
            fontFamily: 'var(--font-body)',
            minWidth: 220,
          }}
        />
      </div>

      {/* Bulk action toolbar */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '12px 16px', marginBottom: 18,
          background: 'var(--sig-soft)',
          border: '1px solid color-mix(in srgb, var(--sig) 35%, var(--line-1))',
          borderRadius: 10,
        }}>
          <span style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500 }}>
            {selected.size} selected
          </span>
          <button onClick={() => setSelected(new Set())} style={{
            fontSize: 11, padding: '5px 11px',
            background: 'transparent', border: '1px solid var(--line-2)',
            borderRadius: 6, color: 'var(--fg-2)', cursor: 'pointer',
            fontFamily: 'var(--font-body)',
          }}>Clear</button>
          <button onClick={bulkDelete} disabled={deleting} style={{
            fontSize: 11, padding: '5px 11px',
            background: 'var(--t-terra)', border: '1px solid var(--t-terra)',
            borderRadius: 6, color: 'var(--bg)', cursor: deleting ? 'wait' : 'pointer',
            fontFamily: 'var(--font-body)', fontWeight: 500,
            marginLeft: 'auto',
          }}>{deleting ? 'Deleting…' : `Delete ${selected.size}`}</button>
        </div>
      )}

      {actionNote && (
        <div style={{
          padding: '10px 14px', marginBottom: 18,
          background: 'var(--bg-2)', border: '1px solid var(--line-1)',
          borderRadius: 8, fontSize: 12.5, color: 'var(--fg-2)',
        }}>{actionNote}</div>
      )}

      {/* Grid */}
      {loading && <div style={{ padding: 40, color: 'var(--fg-3)' }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div style={{
          padding: '60px 32px',
          border: '1px dashed var(--line-2)',
          borderRadius: 14, background: 'var(--bg-1)',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-body)', fontSize: 32, fontWeight: 400,
            letterSpacing: '-1px', color: 'var(--fg)', margin: '0 0 14px',
          }}>
            {vlogs.length === 0 ? 'No vlogs yet.' : `Nothing in ${filter}.`}
          </h2>
          <p style={{ color: 'var(--fg-2)', maxWidth: 480, margin: '0 auto 22px', lineHeight: 1.55 }}>
            {vlogs.length === 0
              ? 'Drop your first vlog. The system threads, clusters, and ships it back.'
              : 'Switch tabs or clear the search.'}
          </p>
          {vlogs.length === 0 && (
            <Link href="/capture" className="canon-btn primary">Capture</Link>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="canon-reveal d3" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
        }}>
          {filtered.map(v => (
            <VlogCard
              key={v.id}
              vlog={v}
              selected={selected.has(v.id)}
              onToggleSelect={() => toggleSelect(v.id)}
            />
          ))}
        </div>
      )}
    </Shell>
  )
}

function VlogCard({ vlog, selected, onToggleSelect }: { vlog: VlogRow; selected: boolean; onToggleSelect: () => void }) {
  const status = vlog.pipeline_status
  const isComplete = status === 'complete'
  const isFailed = status === 'failed'
  const isBroll = status === 'archived'
  const isProcessing = !isComplete && !isFailed && !isBroll
  const color = isComplete ? 'var(--sig)'
    : isFailed ? 'var(--t-terra)'
    : isBroll ? 'var(--fg-3)'
    : 'var(--t-ochre)'

  const title = (vlog.title && vlog.title.trim()) || deriveTitle(vlog.original_filename)
  const ts = vlog.recorded_at ? new Date(vlog.recorded_at) : new Date(vlog.uploaded_at)
  return (
    <div style={{ position: 'relative' }}>
      <Link href={`/vlog/${vlog.id}`} className="tcard" style={{
        '--topic': color, '--topic-soft': `color-mix(in srgb, ${color} 8%, transparent)`,
        display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden',
      } as any}>
        {/* Thumbnail */}
        <div style={{
          aspectRatio: '16 / 9',
          background: vlog.thumbnail_url
            ? `url(${vlog.thumbnail_url}) center / cover`
            : `radial-gradient(circle at 65% 40%, color-mix(in srgb, ${color} 22%, transparent), transparent 65%), linear-gradient(135deg, #1a1a1a, #050505)`,
          position: 'relative',
          borderBottom: '1px solid var(--line-1)',
        }}>
          {vlog.duration_seconds != null && (
            <span style={{
              position: 'absolute', bottom: 8, right: 8,
              fontFamily: 'var(--font-mono)', fontSize: 10,
              padding: '3px 7px',
              background: 'rgba(0,0,0,0.7)',
              borderRadius: 4, color: 'var(--fg)',
            }}>{fmtDur(vlog.duration_seconds)}</span>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 9px',
              background: `color-mix(in srgb, ${color} 10%, var(--bg-2))`,
              border: `1px solid color-mix(in srgb, ${color} 30%, var(--line-1))`,
              borderRadius: 100,
              fontFamily: 'var(--font-mono)',
              fontSize: 9, letterSpacing: 1.4,
              textTransform: 'uppercase',
              color,
            }}>
              <span style={{
                width: 4, height: 4, borderRadius: '50%', background: color,
                animation: isProcessing ? 'canon-pulse 2s ease-in-out infinite' : undefined,
              }}/>
              {isBroll ? 'B-roll' : status.replace(/_/g, ' ')}
            </span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)' }}>
              {ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
          <div style={{
            fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 500,
            color: 'var(--fg)', letterSpacing: '-0.2px', lineHeight: 1.3,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>{title}</div>
          <div style={{
            display: 'flex', gap: 12, flexWrap: 'wrap',
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)',
            letterSpacing: 0.4, marginTop: 'auto',
          }}>
            {vlog.file_size_bytes != null && <span>{fmtSize(vlog.file_size_bytes)}</span>}
            {vlog.thread_count != null && vlog.thread_count > 0 && (
              <span style={{ color: 'var(--fg-1)' }}><b>{vlog.thread_count}</b> threads</span>
            )}
            {vlog.clip_count != null && vlog.clip_count > 0 && (
              <span style={{ color: 'var(--sig)' }}><b>{vlog.clip_count}</b> clips</span>
            )}
          </div>
        </div>
      </Link>

      {/* Select checkbox overlay */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect() }}
        style={{
          position: 'absolute', top: 10, left: 10,
          width: 22, height: 22, borderRadius: 5,
          background: selected ? 'var(--sig)' : 'rgba(0,0,0,0.5)',
          border: `1px solid ${selected ? 'var(--sig)' : 'rgba(255,255,255,0.4)'}`,
          color: selected ? 'var(--bg)' : 'var(--fg)',
          cursor: 'pointer', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, fontSize: 14,
        }}
        title={selected ? 'Deselect' : 'Select'}
      >
        {selected ? '✓' : ''}
      </button>
    </div>
  )
}

function Stat({ n, l, suffix }: { n: number; l: string; suffix?: string }) {
  return (
    <div>
      <div style={{
        fontFamily: 'var(--font-body)', fontWeight: 300,
        fontSize: 36, letterSpacing: '-1.4px',
        color: 'var(--fg)', lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>{n.toLocaleString()}{suffix}</div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 9.5,
        letterSpacing: 1.8, textTransform: 'uppercase',
        color: 'var(--fg-3)', marginTop: 6, fontWeight: 500,
      }}>{l}</div>
    </div>
  )
}

function deriveTitle(filename: string | null): string {
  if (!filename) return 'Untitled vlog'
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, ch => ch.toUpperCase()) || 'Untitled vlog'
}
function fmtDur(s: number): string {
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
