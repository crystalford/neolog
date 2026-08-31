'use client'

/**
 * Photos & videos — one chronological archive of everything you've captured,
 * newest-capture first, day-banded. Owned, permanent. Filter by All /
 * Photos / Videos.
 *
 * Also hosts the progress-video builder: detected photo series (a vision tag
 * recurring across days) can be turned into a time-lapse or before/after
 * with one tap, and the built videos live in their own strip.
 *
 * Photos upload here; video uploads still go through /vlogs and the home
 * recorder. Both show in the merged archive via /api/v2/media.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { PhotoCapturePanel } from '@/components/PhotoCapturePanel'

interface MediaItem {
  id: string
  kind: 'photo' | 'video' | 'update'
  thumb_url: string | null
  at: string
  title: string | null
  subtitle: string | null
  href: string
  width: number | null
  height: number | null
  duration_seconds: number | null
}
interface Series { tag: string; photo_count: number; day_span: number }
interface ProgressVideo {
  id: string; title: string | null; series_tag: string | null
  kind: string; photo_count: number | null; status: string
  error: string | null; play_url: string | null; created_at: string
}

type Filter = 'all' | 'photo' | 'video' | 'update'

export default function PhotosVideosPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [media, setMedia] = useState<MediaItem[] | null>(null)
  const [series, setSeries] = useState<Series[]>([])
  const [videos, setVideos] = useState<ProgressVideo[]>([])
  const [dropOpen, setDropOpen] = useState(false)
  const [building, setBuilding] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const loadMedia = useCallback(async (f: Filter) => {
    try {
      const r = await fetch(`/api/v2/media?type=${f}&limit=600`, { credentials: 'include' })
      const d: any = await r.json()
      setMedia(Array.isArray(d?.items) ? d.items : [])
    } catch { setMedia([]) }
  }, [])

  const loadSeries = useCallback(async () => {
    try {
      const [s, v]: [any, any] = await Promise.all([
        fetch('/api/v2/photos/series', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/v2/photos/progress-video', { credentials: 'include' }).then(r => r.json()),
      ])
      setSeries(Array.isArray(s?.series) ? s.series : [])
      setVideos(Array.isArray(v?.videos) ? v.videos : [])
    } catch {}
  }, [])

  useEffect(() => { loadMedia(filter) }, [filter, loadMedia])
  useEffect(() => { loadSeries() }, [loadSeries])

  const build = async (tag: string, kind: 'timelapse' | 'before_after') => {
    setBuilding(`${tag}:${kind}`); setNote(null)
    try {
      const r = await fetch('/api/v2/photos/progress-video', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_tag: tag, kind }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setNote(`Built "${tag}" ${kind === 'before_after' ? 'before & after' : 'time-lapse'} from ${d.photo_count} photos.`)
      loadSeries()
    } catch (e: any) {
      setNote(`Build failed: ${e?.message || e}`)
    } finally { setBuilding(null) }
  }

  const byDay = useMemo(() => {
    if (!media) return null
    const map = new Map<string, MediaItem[]>()
    for (const m of media) {
      const key = m.at ? new Date(m.at).toISOString().slice(0, 10) : 'unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [media])

  return (
    <Shell>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 4px' }}>
        <section className="canon-reveal d1" style={{ padding: '40px 0 20px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 14,
            display: 'inline-flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 8px var(--sig-glow)' }}/>
            Archive · your photos and videos
          </div>
          <h1 style={{
            fontFamily: 'var(--font-body)', fontWeight: 400,
            fontSize: 56, lineHeight: 1.0, letterSpacing: '-2.2px',
            color: 'var(--fg)', margin: '0 0 14px', textWrap: 'balance',
          }}>
            Archive<span style={{ color: 'var(--sig)' }}>.</span>
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.55, color: 'var(--fg-2)', maxWidth: 620, margin: '0 0 18px' }}>
            Photos and videos, owned and permanent, in the order you lived them.
            Dump your camera roll — HEIC converts in your browser, capture dates come
            from the photo, and each is auto-described so it&rsquo;s searchable.
          </p>
          {/* Status updates are composed from Home ("Log something") —
              this page shows them read-only, day-grouped alongside
              everything else in the archive. */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setDropOpen(o => !o)} className="canon-btn primary" style={{ fontSize: 13 }}>
              {dropOpen ? 'Close' : 'Add photos'}
            </button>
            {(['all', 'photo', 'video', 'update'] as Filter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`canon-filter-chip ${filter === f ? 'active' : ''}`}>
                {f === 'all' ? 'All' : f === 'photo' ? 'Photos' : f === 'video' ? 'Videos' : 'Updates'}
              </button>
            ))}
          </div>
        </section>

        {dropOpen && <div style={{ marginBottom: 24 }}><PhotoCapturePanel onUploaded={() => { loadMedia(filter); loadSeries() }}/></div>}

        {/* Progress videos */}
        {(series.length > 0 || videos.length > 0) && (
          <section style={{ marginBottom: 32 }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 2.2,
              textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 12,
            }}>
              Progress videos
            </div>
            {note && <div style={{ fontSize: 12.5, color: 'var(--fg-2)', marginBottom: 10 }}>{note}</div>}

            {series.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: videos.length ? 16 : 0 }}>
                {series.map(s => (
                  <div key={s.tag} style={{
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    padding: '12px 16px', border: '1px solid var(--line-1)',
                    borderLeft: '3px solid var(--t-sage)', borderRadius: 10, background: 'var(--bg-1)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg)' }}>{s.tag}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-4)', marginTop: 3 }}>
                        {s.photo_count} photos · across {s.day_span} days
                      </div>
                    </div>
                    <button onClick={() => build(s.tag, 'timelapse')} disabled={building !== null}
                      className="canon-btn primary" style={{ fontSize: 12, padding: '6px 12px' }}>
                      {building === `${s.tag}:timelapse` ? 'Building…' : 'Time-lapse'}
                    </button>
                    <button onClick={() => build(s.tag, 'before_after')} disabled={building !== null}
                      className="canon-btn" style={{ fontSize: 12, padding: '6px 12px' }}>
                      {building === `${s.tag}:before_after` ? 'Building…' : 'Before & after'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {videos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 12 }}>
                {videos.map(v => (
                  <div key={v.id} style={{
                    border: '1px solid var(--line-1)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-1)',
                  }}>
                    {v.status === 'ready' && v.play_url
                      ? <video src={v.play_url} controls playsInline style={{ width: '100%', display: 'block', background: '#000' }}/>
                      : (
                        <div style={{ padding: '28px 14px', textAlign: 'center', color: v.status === 'failed' ? 'var(--t-terra)' : 'var(--fg-3)', fontSize: 12.5 }}>
                          {v.status === 'failed' ? (v.error || 'build failed') : 'building…'}
                        </div>
                      )}
                    <div style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--fg)' }}>{v.title}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', marginTop: 3 }}>
                        {v.kind === 'before_after' ? 'before & after' : 'time-lapse'}{v.photo_count ? ` · ${v.photo_count} photos` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Timeline */}
        {byDay === null && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 8 }}>
            {[0,1,2,3,4,5,6,7].map(i => <div key={i} className="neolog-skeleton" style={{ aspectRatio: '1', opacity: 1 - i*0.1 }}/>)}
          </div>
        )}

        {byDay !== null && byDay.length === 0 && (
          <div style={{
            padding: '48px 32px', textAlign: 'center', border: '1px dashed var(--line-2)',
            borderRadius: 14, color: 'var(--fg-3)', fontSize: 15, lineHeight: 1.6, maxWidth: 620,
          }}>
            Nothing here yet. Hit <strong>Add photos</strong> to start your archive, or record a vlog from the home page.
          </div>
        )}

        {byDay !== null && byDay.map(([day, items]) => {
          const updates = items.filter(m => m.kind === 'update')
          const visual = items.filter(m => m.kind !== 'update')
          return (
            <section key={day} style={{ marginBottom: 30 }}>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12,
                paddingBottom: 8, borderBottom: '1px solid var(--line-1)',
              }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 17, fontWeight: 500, color: 'var(--fg)' }}>{dayLabel(day)}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)' }}>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
              </div>
              {/* Updates are text — rows, not squares. They read like a
                  status feed for the day, above whatever got captured
                  visually that same day. */}
              {updates.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: visual.length ? 14 : 0 }}>
                  {updates.map(u => (
                    <div key={`update-${u.id}`} style={{
                      padding: '10px 14px', borderRadius: 8,
                      background: 'var(--bg-1)', border: '1px solid var(--line-1)',
                      borderLeft: '2px solid var(--sig)',
                      fontSize: 14, lineHeight: 1.5, color: 'var(--fg-1)',
                    }}>
                      {u.subtitle}
                    </div>
                  ))}
                </div>
              )}
              {visual.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 8 }}>
                  {visual.map(m => <MediaTile key={`${m.kind}-${m.id}`} item={m}/>)}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </Shell>
  )
}

function MediaTile({ item }: { item: MediaItem }) {
  const [hover, setHover] = useState(false)
  const inner = (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden',
        background: 'var(--bg-2)', border: '1px solid var(--line-1)',
      }}
    >
      {item.thumb_url
        ? <img src={item.thumb_url} alt={item.subtitle || item.title || ''} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--fg-4)', fontSize: 11 }}>…</div>}
      {item.kind === 'video' && (
        <span style={{
          position: 'absolute', top: 6, left: 6,
          fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: 0.8, textTransform: 'uppercase',
          padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.6)', color: 'var(--fg-1)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          ▶ {item.duration_seconds != null ? fmtDur(item.duration_seconds) : 'video'}
        </span>
      )}
      {hover && (item.title || item.subtitle) && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 10px',
          fontSize: 11.5, lineHeight: 1.4, color: 'var(--fg)',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.82), rgba(0,0,0,0))',
        }}>
          {item.title || item.subtitle}
        </div>
      )}
    </div>
  )
  // Videos link to their detail page; photos stay inline (no detail page yet).
  return item.kind === 'video'
    ? <Link href={item.href} style={{ textDecoration: 'none' }}>{inner}</Link>
    : inner
}

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function dayLabel(day: string): string {
  if (day === 'unknown') return 'Undated'
  const today = new Date().toISOString().slice(0, 10)
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (day === today) return 'Today'
  if (day === yest) return 'Yesterday'
  return new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
}
