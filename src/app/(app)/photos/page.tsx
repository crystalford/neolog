'use client'

/**
 * Photos — the vault's still-image archive.
 *
 * Day-banded grid of everything you've uploaded, newest first, with an inline
 * upload panel. This is the "replace Google Photos" surface: owned, permanent,
 * chronological. Each photo carries the vision model's one-line description
 * once tagging finishes.
 *
 * Videos live in /vlogs; photos live here. A future pass merges both into one
 * unified timeline.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Shell from '@/components/Shell'
import { PhotoCapturePanel } from '@/components/PhotoCapturePanel'

interface Photo {
  id: string
  thumb_url: string | null
  original_filename: string | null
  width: number | null
  height: number | null
  taken_at: string | null
  taken_at_source: string | null
  caption: string | null
  vision_description: string | null
  vision_tags: string[]
  vision_status: string
  created_at: string
}

export default function PhotosPage() {
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [dropOpen, setDropOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/v2/photos?limit=500', { credentials: 'include' })
      const d: any = await r.json()
      setPhotos(Array.isArray(d?.photos) ? d.photos : [])
    } catch {
      setPhotos([])
    }
  }, [])
  useEffect(() => { load() }, [load])

  const byDay = useMemo(() => {
    if (!photos) return null
    const map = new Map<string, Photo[]>()
    for (const p of photos) {
      const ts = p.taken_at || p.created_at
      const key = ts ? new Date(ts).toISOString().slice(0, 10) : 'unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [photos])

  return (
    <Shell>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 4px' }}>
        <section className="canon-reveal d1" style={{ padding: '40px 0 24px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 14,
            display: 'inline-flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 8px var(--sig-glow)' }}/>
            The vault · photos
          </div>
          <h1 style={{
            fontFamily: 'var(--font-body)', fontWeight: 400,
            fontSize: 56, lineHeight: 1.0, letterSpacing: '-2.2px',
            color: 'var(--fg)', margin: '0 0 14px', textWrap: 'balance',
          }}>
            Your photos<span style={{ color: 'var(--fg-3)', fontWeight: 300 }}>,</span> kept<span style={{ color: 'var(--sig)' }}>.</span>
          </h1>
          <p style={{
            fontSize: 16, lineHeight: 1.55, color: 'var(--fg-2)',
            maxWidth: 620, letterSpacing: '-0.15px', margin: '0 0 20px',
          }}>
            Owned, permanent, chronological. Dump your camera roll here — the system
            reads the capture date, converts iPhone HEIC in your browser, and
            describes each photo so it&rsquo;s searchable without you labeling anything.
          </p>
          <button
            onClick={() => setDropOpen(o => !o)}
            className="canon-btn primary"
            style={{ fontSize: 13 }}
          >
            {dropOpen ? 'Close' : 'Add photos'}
          </button>
        </section>

        {dropOpen && (
          <div style={{ marginBottom: 28 }}>
            <PhotoCapturePanel onUploaded={load}/>
          </div>
        )}

        {byDay === null && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 8 }}>
            {[0,1,2,3,4,5,6,7].map(i => <div key={i} className="neolog-skeleton" style={{ aspectRatio: '1', opacity: 1 - i*0.1 }}/>)}
          </div>
        )}

        {byDay !== null && byDay.length === 0 && (
          <div style={{
            padding: '48px 32px', textAlign: 'center',
            border: '1px dashed var(--line-2)', borderRadius: 14,
            color: 'var(--fg-3)', fontSize: 15, lineHeight: 1.6, maxWidth: 620,
          }}>
            No photos yet. Hit <strong>Add photos</strong> and drop your camera roll in.
          </div>
        )}

        {byDay !== null && byDay.map(([day, dayPhotos]) => (
          <section key={day} style={{ marginBottom: 32 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12,
              paddingBottom: 8, borderBottom: '1px solid var(--line-1)',
            }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 17, fontWeight: 500, color: 'var(--fg)' }}>
                {dayLabel(day)}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)' }}>
                {dayPhotos.length} {dayPhotos.length === 1 ? 'photo' : 'photos'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 8 }}>
              {dayPhotos.map(p => <PhotoTile key={p.id} photo={p}/>)}
            </div>
          </section>
        ))}
      </div>
    </Shell>
  )
}

function PhotoTile({ photo }: { photo: Photo }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden',
        background: 'var(--bg-2)', border: '1px solid var(--line-1)',
      }}
    >
      {photo.thumb_url
        ? <img src={photo.thumb_url} alt={photo.vision_description || ''} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--fg-4)', fontSize: 11 }}>…</div>}
      {(hover && (photo.caption || photo.vision_description)) && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '8px 10px', fontSize: 11.5, lineHeight: 1.4, color: 'var(--fg)',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.82), rgba(0,0,0,0))',
        }}>
          {photo.caption || photo.vision_description}
        </div>
      )}
      {photo.vision_status === 'pending' && (
        <span style={{
          position: 'absolute', top: 6, right: 6,
          fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 0.8, textTransform: 'uppercase',
          padding: '2px 5px', borderRadius: 4, background: 'rgba(0,0,0,0.55)', color: 'var(--fg-3)',
        }}>tagging</span>
      )}
    </div>
  )
}

function dayLabel(day: string): string {
  if (day === 'unknown') return 'Undated'
  const today = new Date().toISOString().slice(0, 10)
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (day === today) return 'Today'
  if (day === yest) return 'Yesterday'
  return new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
}
