'use client'

/**
 * PhotoCapturePanel — drop or pick photos; the browser converts each
 * (HEIC included) to a JPEG on a canvas, reads EXIF taken-at + orientation,
 * uploads the display JPEG straight to R2 via a presigned PUT, and registers
 * the row. Vision tagging happens server-side after registration.
 *
 * Reuses the video CapturePanel's canvas→base64 thumbnail idea (see
 * src/lib/photo-client.ts) but for stills, and the presign→PUT→register
 * upload shape from the vlog flow.
 */

import { useCallback, useRef, useState } from 'react'
import { preparePhoto } from '@/lib/photo-client'

type Status = 'queued' | 'preparing' | 'uploading' | 'registering' | 'done' | 'failed'
interface Item {
  id: string
  file: File
  status: Status
  previewUrl: string | null
  error?: string
}

export function PhotoCapturePanel({ onUploaded }: { onUploaded?: () => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [running, setRunning] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const add = useCallback((files: FileList | File[] | null) => {
    if (!files) return
    const list = Array.from(files).filter(f => /^image\//.test(f.type) || /\.(hei[cf]|jpe?g|png|webp)$/i.test(f.name))
    if (list.length === 0) return
    setItems(prev => [
      ...prev,
      ...list.map(f => ({
        id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: 'queued' as Status,
        previewUrl: null,
      })),
    ])
  }, [])

  const run = useCallback(async () => {
    setRunning(true)
    // Snapshot queued items.
    const queued = items.filter(i => i.status === 'queued')
    for (const item of queued) {
      const set = (patch: Partial<Item>) =>
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...patch } : i))
      try {
        set({ status: 'preparing' })
        const prepared = await preparePhoto(item.file)
        const preview = URL.createObjectURL(prepared.displayBlob)
        set({ previewUrl: preview })

        set({ status: 'uploading' })
        const presignResp = await fetch('/api/v2/photos/presign', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: item.file.name }),
        })
        const presign: any = await presignResp.json()
        if (!presignResp.ok || !presign?.url) throw new Error(presign?.error || 'presign failed')

        const put = await fetch(presign.url, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: prepared.displayBlob,
        })
        if (!put.ok) throw new Error(`upload failed (${put.status})`)

        set({ status: 'registering' })
        const reg = await fetch('/api/v2/photos', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            r2_key: presign.key,
            original_filename: item.file.name,
            mime_type: 'image/jpeg',
            file_size_bytes: prepared.displayBlob.size,
            width: prepared.width,
            height: prepared.height,
            taken_at: prepared.takenAt,
            taken_at_source: prepared.takenAtSource,
            thumbnail_blob_base64: prepared.thumbnailBase64,
          }),
        })
        const regData: any = await reg.json()
        if (!reg.ok) throw new Error(regData?.error || `register failed (${reg.status})`)
        set({ status: 'done' })
      } catch (e: any) {
        set({ status: 'failed', error: e?.message || String(e) })
      }
    }
    setRunning(false)
    onUploaded?.()
  }, [items, onUploaded])

  const queuedCount = items.filter(i => i.status === 'queued').length
  const doneCount = items.filter(i => i.status === 'done').length

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files) }}
      style={{
        border: `1px dashed ${dragging ? 'var(--sig)' : 'var(--line-2)'}`,
        borderRadius: 14, background: dragging ? 'color-mix(in srgb, var(--sig) 6%, transparent)' : 'var(--bg-1)',
        padding: 20, transition: 'border-color 150ms, background 150ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => inputRef.current?.click()}
          className="canon-btn primary"
          style={{ fontSize: 13 }}
        >
          Choose photos
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          style={{ display: 'none' }}
          onChange={e => add(e.target.files)}
        />
        {queuedCount > 0 && (
          <button onClick={run} disabled={running} className="canon-btn" style={{ fontSize: 13 }}>
            {running ? 'Uploading…' : `Upload ${queuedCount} photo${queuedCount === 1 ? '' : 's'}`}
          </button>
        )}
        <span style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
          {doneCount > 0 ? `${doneCount} uploaded · ` : ''}
          drag photos here or choose. HEIC is fine — converted in your browser.
        </span>
      </div>

      {items.length > 0 && (
        <div style={{
          marginTop: 16, display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10,
        }}>
          {items.map(i => (
            <div key={i.id} style={{
              borderRadius: 10, overflow: 'hidden', position: 'relative',
              border: '1px solid var(--line-1)', background: 'var(--bg-2)',
              aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {i.previewUrl
                ? <img src={i.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                : <span style={{ fontSize: 11, color: 'var(--fg-4)', padding: 6, textAlign: 'center' }}>{i.file.name.slice(0, 24)}</span>}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 0.6,
                textTransform: 'uppercase', textAlign: 'center', padding: '3px 4px',
                background: 'rgba(0,0,0,0.6)',
                color: i.status === 'failed' ? 'var(--t-terra)' : i.status === 'done' ? 'var(--t-sage)' : 'var(--fg-2)',
              }}>
                {i.status === 'failed' ? (i.error || 'failed').slice(0, 28) : i.status}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
