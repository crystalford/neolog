'use client'

/**
 * Vlogs — the raw archive. Replaces /uploads.
 *
 * Ported from neolog-design/project/screens/vlogs.jsx. Grid of vlog cards
 * with topic dot, filename, date, size, thread count. Filter pills across
 * the top + status pill on each card.
 *
 * Live data: GET /api/v2/vlogs?limit=200 (existing endpoint).
 */

export const runtime = 'edge'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Shell, { NavIcons, TopicDot } from '@/components/Shell'

interface VlogRow {
  id: string
  original_filename: string | null
  file_size_bytes: number | null
  mime_type: string | null
  duration_seconds: number | null
  recorded_at: string | null
  uploaded_at: string
  thumbnail_url: string | null
  pipeline_status: string
  has_transcript?: 0 | 1 | boolean
}

type Filter = 'all' | 'today' | 'week' | 'processing' | 'complete' | 'archived' | 'failed'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'today',      label: 'Today' },
  { key: 'week',       label: 'This week' },
  { key: 'processing', label: 'Processing' },
  { key: 'complete',   label: 'Complete' },
  { key: 'archived',   label: 'Archived' },
  { key: 'failed',     label: 'Failed' },
]

export default function VlogsPage() {
  const [vlogs, setVlogs] = useState<VlogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkMode, setBulkMode] = useState<'cheap' | 'premium'>('cheap')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ dispatched: number; failed: number } | null>(null)

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
      const recordedTs = v.recorded_at ? new Date(v.recorded_at).getTime() : new Date(v.uploaded_at).getTime()
      const ageDays = (now - recordedTs) / dayMs
      if (ageDays < 1) c.today++
      if (ageDays < 7) c.week++
      if (['transcoding', 'transcribing', 'extracting', 'uploaded'].includes(v.pipeline_status)) c.processing++
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
      if (q) {
        const hay = `${v.original_filename ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filter === 'all') return true
      const recordedTs = v.recorded_at ? new Date(v.recorded_at).getTime() : new Date(v.uploaded_at).getTime()
      const ageDays = (now - recordedTs) / dayMs
      if (filter === 'today') return ageDays < 1
      if (filter === 'week') return ageDays < 7
      if (filter === 'processing') return ['transcoding', 'transcribing', 'extracting', 'uploaded'].includes(v.pipeline_status)
      if (filter === 'complete') return v.pipeline_status === 'complete'
      if (filter === 'archived') return v.pipeline_status === 'archived'
      if (filter === 'failed') return v.pipeline_status === 'failed'
      return true
    })
  }, [vlogs, filter, query])

  const totalBytes = vlogs.reduce((s, v) => s + (v.file_size_bytes ?? 0), 0)
  const totalGb = (totalBytes / 1_000_000_000).toFixed(2)
  const busy = counts.processing > 0

  return (
    <Shell active="vlogs" breadcrumb={['Vlogs']} hot={busy ? `${counts.processing} active` : 'all healthy'} busy={busy}>
      <div className="pad-tight">
        <div className="h1-row">
          <div>
            <h1>Vlogs</h1>
            <p className="sub" style={{ marginBottom: 0, marginTop: 6 }}>
              Every recording you've brought into Neolog. {counts.all} files · {totalGb} GB on disk.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={load}><span className="ico">{NavIcons.Refresh}</span>Refresh</button>
            <button className="btn" onClick={() => { setBulkResult(null); setBulkOpen(true) }}>
              Re-process all
            </button>
            <Link href="/capture" className="btn primary">
              <span className="ico">{NavIcons.Plus}</span>Add vlog<span className="kbd">N</span>
            </Link>
          </div>
        </div>

        {bulkOpen && (
          <BulkReprocessModal
            counts={counts}
            mode={bulkMode}
            setMode={setBulkMode}
            busy={bulkBusy}
            result={bulkResult}
            onClose={() => setBulkOpen(false)}
            onRun={async (scope) => {
              setBulkBusy(true)
              setBulkResult(null)
              try {
                const r = await fetch('/api/v2/admin/reprocess-vlogs', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ scope, mode: bulkMode }),
                })
                const d: any = r.ok ? await r.json() : { error: `HTTP ${r.status}` }
                if (!r.ok) {
                  setBulkResult({ dispatched: 0, failed: 0 })
                  alert(`Bulk reprocess failed: ${d?.details || d?.error || 'unknown'}`)
                } else {
                  setBulkResult({ dispatched: d.dispatched ?? 0, failed: d.failed ?? 0 })
                  load()
                }
              } catch (err: any) {
                alert(`Bulk reprocess error: ${err?.message || err}`)
              } finally {
                setBulkBusy(false)
              }
            }}
          />
        )}

        {/* Filter row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 24, marginBottom: 18, flexWrap: 'wrap' }}>
          <div className="pills">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`filter-pill ${filter === f.key ? 'active' : ''}`}
              >
                {f.label} <span className="n">{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 11px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6, width: 240 }}>
            <span style={{ display: 'inline-flex', width: 13, height: 13, color: 'var(--fg-4)' }}>{NavIcons.Search}</span>
            <input
              placeholder="Filename or content"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ flex: 1, fontSize: 12, color: 'var(--fg-1)' }}
            />
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ color: 'var(--fg-3)', padding: 40, textAlign: 'center' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="ico">{NavIcons.Vlogs}</div>
            <h3>No vlogs match this filter</h3>
            <p>Try a different filter or upload your first vlog.</p>
            <Link href="/capture" className="btn primary"><span className="ico">{NavIcons.Plus}</span>Add vlog</Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {filtered.map(v => <VlogCard key={v.id} v={v}/>)}
          </div>
        )}
      </div>
    </Shell>
  )
}

function BulkReprocessModal({
  counts, mode, setMode, busy, result, onClose, onRun,
}: {
  counts: Record<Filter, number>
  mode: 'cheap' | 'premium'
  setMode: (m: 'cheap' | 'premium') => void
  busy: boolean
  result: { dispatched: number; failed: number } | null
  onClose: () => void
  onRun: (scope: 'incomplete' | 'all') => void
}) {
  const incomplete = counts.processing + counts.failed + counts.archived
  const all = counts.all
  const perVlog = mode === 'premium' ? 0.05 : 0.02
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50,
    }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{
        padding: 20, maxWidth: 520, width: '90%',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>Bulk re-process vlogs</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.55, margin: 0 }}>
          Kicks the post-upload pipeline for each vlog. Existing transcripts are reused;
          extraction re-runs against the new code paths. Pick a mode:
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          {([
            ['cheap',   'Cheap',   'Llama — ~$0.02 / vlog'],
            ['premium', 'Premium', 'Sonnet — ~$0.05 / vlog'],
          ] as const).map(([k, label, sub]) => (
            <button
              key={k}
              className={`fchip ${mode === k ? 'active' : ''}`}
              style={{ flex: 1, padding: '10px 14px', flexDirection: 'column', alignItems: 'flex-start' }}
              onClick={() => setMode(k)}
            >
              <span style={{ fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{sub}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          <button
            className="btn"
            disabled={busy || incomplete === 0}
            onClick={() => onRun('incomplete')}
            style={{ justifyContent: 'flex-start' }}
          >
            <span>Just incomplete</span>
            <span className="mono" style={{ marginLeft: 'auto', color: 'var(--fg-3)' }}>
              {incomplete} vlogs · ~${(incomplete * perVlog).toFixed(2)}
            </span>
          </button>
          <button
            className="btn"
            disabled={busy || all === 0}
            onClick={() => onRun('all')}
            style={{ justifyContent: 'flex-start' }}
          >
            <span>Everything</span>
            <span className="mono" style={{ marginLeft: 'auto', color: 'var(--fg-3)' }}>
              {all} vlogs · ~${(all * perVlog).toFixed(2)}
            </span>
          </button>
        </div>

        {busy && (
          <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
            Dispatching… the requests will continue in the background even if you close this.
          </div>
        )}

        {result && (
          <div style={{ fontSize: 13, color: result.failed > 0 ? 'var(--err)' : 'var(--ok)' }}>
            Dispatched {result.dispatched} · failed {result.failed}.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function VlogCard({ v }: { v: VlogRow }) {
  const statusCls = v.pipeline_status === 'complete' ? 'ok'
    : v.pipeline_status === 'archived' ? 'mute'
    : v.pipeline_status === 'failed' ? 'err'
    : 'hot'
  const date = v.recorded_at ? new Date(v.recorded_at) : new Date(v.uploaded_at)
  const dateLabel = formatDate(date)
  const size = v.file_size_bytes ? `${(v.file_size_bytes / 1_000_000).toFixed(1)} MB` : '—'

  return (
    <Link href={`/timeline/${v.id}`} className="card no-pad" style={{ overflow: 'hidden', cursor: 'pointer', display: 'block' }}>
      <div style={{
        aspectRatio: '16/10',
        background: v.thumbnail_url
          ? `center / cover no-repeat url(${v.thumbnail_url})`
          : `linear-gradient(135deg, var(--bg-3), var(--bg-1), var(--bg-2))`,
        position: 'relative',
        borderBottom: '1px solid var(--line)',
      }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.25)' }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="white"><polygon points="5,3 12,8 5,13"/></svg>
          </div>
        </div>
        <span className={`pill ${statusCls}`} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)' }}>{v.pipeline_status}</span>
      </div>
      <div style={{ padding: '11px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <TopicDot/>
          <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
            {v.original_filename ?? v.id}
          </span>
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', display: 'flex', justifyContent: 'space-between' }}>
          <span>{dateLabel} · {size}</span>
          {v.has_transcript ? <span style={{ color: 'var(--fg-2)' }}>transcribed</span> : <span>—</span>}
        </div>
      </div>
    </Link>
  )
}

function formatDate(d: Date): string {
  const now = new Date()
  const dayDiff = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (dayDiff === 0) return 'Today ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (dayDiff === 1) return 'Yesterday ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (dayDiff < 7) return d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
