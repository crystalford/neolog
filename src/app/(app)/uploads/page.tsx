/**
 * Uploads — raw vlog gallery. Every video the operator has dropped in,
 * shown as a thumbnail grid with pipeline status badges.
 *
 * Distinct from /library (finished productions). This is the input archive;
 * Library is the output archive.
 */
'use client'

import { useEffect, useMemo, useState } from 'react'

interface UploadRow {
  id: string
  original_filename: string | null
  file_size_bytes: number | null
  mime_type: string | null
  duration_seconds: number | null
  recorded_at: string | null
  thumbnail_url: string | null
  pipeline_status: string
  uploaded_at: string
}

type Filter = 'all' | 'uploaded' | 'transcribing' | 'extracting' | 'complete' | 'archived' | 'failed'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'complete', label: 'Complete' },
  { key: 'extracting', label: 'Extracting' },
  { key: 'transcribing', label: 'Transcribing' },
  { key: 'uploaded', label: 'Queued' },
  { key: 'archived', label: 'Archived' },
  { key: 'failed', label: 'Failed' },
]

export default function UploadsPage() {
  const [vlogs, setVlogs] = useState<UploadRow[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v2/vlogs?limit=500', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { vlogs: [] })
      .then(d => { setVlogs(d.vlogs || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return vlogs
    return vlogs.filter(v => v.pipeline_status === filter)
  }, [vlogs, filter])

  const totalBytes = vlogs.reduce((s, v) => s + (v.file_size_bytes ?? 0), 0)
  const totalGb = (totalBytes / 1_000_000_000).toFixed(2)

  return (
    <main>
      <section className="hero" style={{ paddingBottom: 8 }}>
        <div className="crumb reveal d2">Raw archive</div>
        <h1 className="reveal d3">Uploads</h1>
        <p className="lead reveal d4">Every vlog you've dropped in. Thumbnails come from the locked transcode-then-extract step; status reflects where the pipeline is.</p>
      </section>

      <div className="gallery-summary reveal d4">
        <span><span className="n">{vlogs.length}</span> vlogs</span>
        <span><span className="n">{totalGb}</span> GB in R2</span>
        <span><span className="n">{vlogs.filter(v => v.pipeline_status === 'complete').length}</span> complete</span>
        <span><span className="n">{vlogs.filter(v => v.pipeline_status === 'archived').length}</span> archived</span>
      </div>

      <div className="filter-bar reveal d4" style={{ padding: '0 24px 16px' }}>
        {FILTERS.map(f => {
          const count = f.key === 'all' ? vlogs.length : vlogs.filter(v => v.pipeline_status === f.key).length
          return (
            <button key={f.key} className={`fchip ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label} <span className="num">{count}</span>
            </button>
          )
        })}
      </div>

      {loading && (
        <div className="empty-row reveal d5">
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 2, color: 'var(--bone-3)' }}>LOADING…</p>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="empty-row reveal d5">
          <h3>{filter === 'all' ? 'No uploads yet' : `No ${filter} uploads`}</h3>
          <p>{filter === 'all' ? 'Tap Record or Upload below to drop in your first vlog.' : `Switch the filter to see vlogs in other states.`}</p>
        </div>
      )}

      <div className="gallery reveal d5">
        {filtered.map(v => (
          <a key={v.id} href={`/timeline/${v.id}`} className="tile" style={v.thumbnail_url ? { backgroundImage: `url(${v.thumbnail_url})` } : undefined}>
            <span className={`tile-badge ${badgeKindFor(v.pipeline_status)}`}>{v.pipeline_status}</span>
            <div className="tile-foot">
              <span className="name">{deriveTitle(v.original_filename)}</span>
              {v.duration_seconds != null && <span className="dur">{fmtDur(v.duration_seconds)}</span>}
            </div>
          </a>
        ))}
      </div>
    </main>
  )
}

function badgeKindFor(s: string): 'archived' | 'error' | 'processing' | '' {
  if (s === 'archived') return 'archived'
  if (s === 'failed') return 'error'
  if (s === 'complete') return ''
  return 'processing'
}
function fmtDur(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
function deriveTitle(filename: string | null): string {
  if (!filename) return 'Untitled'
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled'
}
