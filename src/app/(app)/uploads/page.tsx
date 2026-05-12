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
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ inserted: number; skipped_existing: number; total_objects_scanned: number } | null>(null)
  const [showSupabaseForm, setShowSupabaseForm] = useState(false)
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const [thumbImporting, setThumbImporting] = useState(false)
  const [thumbResult, setThumbResult] = useState<{ imported: number; supabase_rows_scanned: number; skipped_already_set_or_no_d1_match: number; error?: string } | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [regenResult, setRegenResult] = useState<{ reset?: number; message?: string; error?: string } | null>(null)

  const regenerateThumbnails = async () => {
    setRegenerating(true)
    setRegenResult(null)
    try {
      const r = await fetch('/api/v2/admin/regenerate-thumbnails', {
        method: 'POST',
        credentials: 'include',
      })
      const text = await r.text()
      let data: any
      try { data = JSON.parse(text) }
      catch { data = { error: text.slice(0, 200) } }
      if (!r.ok) {
        setRegenResult({ error: data.error || `HTTP ${r.status}` })
      } else {
        setRegenResult(data)
        load()  // Refresh tiles so reset rows flip badge immediately
      }
    } catch (e: any) {
      setRegenResult({ error: String(e.message || e) })
    } finally {
      setRegenerating(false)
    }
  }

  const load = () => {
    setLoading(true)
    fetch('/api/v2/vlogs?limit=500', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { vlogs: [] })
      .then((d: any) => { setVlogs(d.vlogs || []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(load, [])

  const importSupabaseThumbnails = async () => {
    setThumbImporting(true)
    setThumbResult(null)
    let offset = 0
    let totalImported = 0
    let totalScanned = 0
    let totalSkipped = 0

    try {
      while (true) {
        const r = await fetch('/api/v2/admin/import-supabase-thumbnails', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ supabase_url: supabaseUrl.trim(), service_role_key: supabaseKey.trim(), offset }),
        })
        const text = await r.text()
        let data: any = null
        try { data = JSON.parse(text) }
        catch {
          setThumbResult({ imported: totalImported, supabase_rows_scanned: totalScanned, skipped_already_set_or_no_d1_match: totalSkipped, error: `Server returned non-JSON (HTTP ${r.status}) at offset ${offset}. First chars: ${text.slice(0, 160)}` })
          return
        }
        if (!r.ok) {
          setThumbResult({ imported: totalImported, supabase_rows_scanned: totalScanned, skipped_already_set_or_no_d1_match: totalSkipped, error: data?.error || `HTTP ${r.status} at offset ${offset}` })
          return
        }
        totalImported += data.imported || 0
        totalScanned += data.page_rows || 0
        totalSkipped += data.skipped_already_set || 0
        // Show interim progress
        setThumbResult({ imported: totalImported, supabase_rows_scanned: totalScanned, skipped_already_set_or_no_d1_match: totalSkipped })
        if (data.done) break
        offset = data.next_offset
        if (offset > 5000) break  // safety stop
      }
      load()
    } catch (e: any) {
      setThumbResult({ imported: totalImported, supabase_rows_scanned: totalScanned, skipped_already_set_or_no_d1_match: totalSkipped, error: String(e.message || e) })
    } finally {
      setThumbImporting(false)
    }
  }

  const importFromR2 = async () => {
    setImporting(true)
    setImportResult(null)
    try {
      const r = await fetch('/api/v2/admin/import-r2', { method: 'POST', credentials: 'include' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data: any = await r.json()
      setImportResult(data)
      load()
    } catch (e: any) {
      setImportResult({ inserted: -1, skipped_existing: 0, total_objects_scanned: 0 })
    } finally {
      setImporting(false)
    }
  }

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
        <button
          onClick={importFromR2}
          disabled={importing}
          style={adminPillStyle(importing)}
        >
          {importing ? 'Scanning R2…' : 'Import from R2'}
        </button>
        <button
          onClick={regenerateThumbnails}
          disabled={regenerating}
          style={adminPillStyle(regenerating)}
          title="Resets rows stuck on 'transcoding' back to 'archived'. The in-flight workflows continue on Cloudflare's side."
        >
          {regenerating ? 'Resetting…' : 'Reset stuck transcoding rows'}
        </button>
      </div>

      {regenResult && (
        <div className="reveal d4" style={{
          margin: '0 24px 16px',
          padding: '12px 16px',
          background: regenResult.error ? 'rgba(198,96,66,0.10)' : 'var(--ink-2)',
          border: `1px solid ${regenResult.error ? 'var(--state-err)' : 'var(--line)'}`,
          borderRadius: 12,
          fontSize: 13,
          color: 'var(--bone-1)',
        }}>
          {regenResult.error ? <>Failed: {regenResult.error}</> : <>{regenResult.message}</>}
        </div>
      )}

      {showSupabaseForm && (
        <div className="reveal d4" style={{
          margin: '0 24px 16px',
          padding: '16px 18px',
          background: 'var(--ink-2)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <div style={{ fontSize: 13, color: 'var(--bone-1)', lineHeight: 1.55 }}>
            Paste your <strong style={{ color: 'var(--bone)' }}>paused Supabase</strong> credentials. We'll read
            the old <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--bone)' }}>video_uploads.thumbnail_url</code> column and copy each thumbnail into the matching D1 vlog by R2 key. Read-only on Supabase — nothing is written there.
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--bone-3)' }}>Project URL</span>
            <input
              type="text"
              placeholder="https://abcdefghij.supabase.co"
              value={supabaseUrl}
              onChange={e => setSupabaseUrl(e.target.value)}
              style={inputStyle}
            />
            <span style={{ fontSize: 11, color: 'var(--bone-4)' }}>Dashboard → Project → Settings → API → "Project URL"</span>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--bone-3)' }}>service_role key</span>
            <input
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIs… (long JWT, not your login password)"
              value={supabaseKey}
              onChange={e => setSupabaseKey(e.target.value)}
              style={inputStyle}
            />
            <span style={{ fontSize: 11, color: 'var(--bone-4)' }}>Same page → Project API keys → row labeled <strong style={{ color: 'var(--bone-2)' }}>service_role</strong> → Reveal</span>
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={importSupabaseThumbnails}
              disabled={!supabaseUrl.trim() || !supabaseKey.trim() || thumbImporting}
              style={{
                padding: '10px 18px',
                border: '1px solid var(--bone-3)',
                background: 'rgba(236,228,210,0.04)',
                color: 'var(--bone)',
                borderRadius: 100,
                fontSize: 13,
                fontWeight: 500,
                cursor: thumbImporting ? 'wait' : 'pointer',
              }}>{thumbImporting ? 'Pulling…' : 'Pull thumbnails'}</button>
            <span style={{ fontSize: 11, color: 'var(--bone-3)' }}>The key is never persisted — used in-memory for this request only.</span>
          </div>
        </div>
      )}

      {thumbResult && (
        <div className="reveal d4" style={{
          margin: '0 24px 16px',
          padding: '12px 16px',
          background: thumbResult.error ? 'rgba(198,96,66,0.10)' : 'var(--ink-2)',
          border: `1px solid ${thumbResult.error ? 'var(--state-err)' : 'var(--line)'}`,
          borderRadius: 12,
          fontSize: 13,
          color: 'var(--bone-1)',
        }}>
          {thumbResult.error ? (
            <>Pull failed: {thumbResult.error}</>
          ) : (
            <>
              Scanned <strong>{thumbResult.supabase_rows_scanned}</strong> Supabase rows ·
              copied <strong>{thumbResult.imported}</strong> thumbnail{thumbResult.imported === 1 ? '' : 's'} ·
              skipped <strong>{thumbResult.skipped_already_set_or_no_d1_match}</strong>.
            </>
          )}
        </div>
      )}

      {importResult && (
        <div className="reveal d4" style={{
          margin: '0 24px 16px',
          padding: '12px 16px',
          background: importResult.inserted < 0 ? 'rgba(198,96,66,0.10)' : 'var(--ink-2)',
          border: `1px solid ${importResult.inserted < 0 ? 'var(--state-err)' : 'var(--line)'}`,
          borderRadius: 12,
          fontSize: 13,
          color: 'var(--bone-1)',
        }}>
          {importResult.inserted < 0 ? (
            <>Import failed — check the worker logs.</>
          ) : (
            <>
              Scanned <strong>{importResult.total_objects_scanned}</strong> R2 objects ·
              imported <strong>{importResult.inserted}</strong> new vlog{importResult.inserted === 1 ? '' : 's'} ·
              skipped <strong>{importResult.skipped_existing}</strong> already in D1.
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--bone-3)' }}>
                All imports land as <em>archived</em> (no auto-extract). Click any vlog → Re-extract to process.
              </div>
            </>
          )}
        </div>
      )}

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
          <TileVideoPoster key={v.id} v={v} />
        ))}
      </div>
    </main>
  )
}

/**
 * TileVideoPoster — single gallery tile, using an <img> for thumbnail.
 *
 * Render priority:
 *   1. thumbnail_url (server-provided: legacy data URI OR presigned R2 jpg) —
 *      rendered as <img loading="lazy">. Native browser lazy-load handles
 *      viewport visibility with zero JS — basically free per tile.
 *   2. Placeholder ("no preview") for vlogs that haven't been processed yet
 *      or that errored.
 *
 * Previous version used <video preload="metadata"> per tile for first-frame
 * poster. That approach (even with IntersectionObserver) maintains decoder
 * state, GPU, audio context per element — ~150-200ms work × 173 tiles =
 * unresponsive UI. Static <img> is what video archives have always used.
 */
function TileVideoPoster({ v }: { v: UploadRow }) {
  const [errored, setErrored] = useState(false)
  const src = !errored ? v.thumbnail_url : null
  return (
    <a href={`/timeline/${v.id}`} className="tile">
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setErrored(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
            background: 'transparent',
          }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--bone-4)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          no preview
        </div>
      )}
      <span className={`tile-badge ${badgeKindFor(v.pipeline_status)}`}>{v.pipeline_status}</span>
      <div className="tile-foot">
        <span className="name">{deriveTitle(v.original_filename)}</span>
        {v.duration_seconds != null && <span className="dur">{fmtDur(v.duration_seconds)}</span>}
      </div>
    </a>
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
function adminPillStyle(busy: boolean): React.CSSProperties {
  return {
    marginLeft: 'auto',
    padding: '6px 12px',
    border: '1px solid var(--line-bright)',
    borderRadius: 100,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'var(--bone-1)',
    background: 'rgba(236,228,210,0.04)',
    cursor: busy ? 'wait' : 'pointer',
  }
}
const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--ink-1)',
  border: '1px solid var(--line-warm)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  color: 'var(--bone)',
  fontFamily: 'JetBrains Mono, monospace',
}

function deriveTitle(filename: string | null): string {
  if (!filename) return 'Untitled'
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled'
}
