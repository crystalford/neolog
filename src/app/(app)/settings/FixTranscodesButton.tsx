'use client'

import { useState } from 'react'

interface VlogRow {
  id: string
  original_filename: string | null
  has_transcoded?: boolean
  mime_type: string | null
}

export function FixTranscodesButton() {
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [errors, setErrors] = useState<string[]>([])

  const run = async () => {
    if (running) return
    setRunning(true)
    setErrors([])
    setStatus('Scanning vlogs missing the H.264 transcode…')
    try {
      // Pull every vlog; filter to ones missing transcoded_r2_key. Could be a
      // dedicated /api/admin/missing-transcodes endpoint but the existing
      // /vlogs list already returns transcoded_r2_key so we use it directly.
      const r = await fetch('/api/v2/vlogs?limit=500', { credentials: 'include' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = (await r.json()) as { vlogs?: VlogRow[] }
      const needs = (d.vlogs ?? []).filter(v =>
        v.has_transcoded === false && (v.mime_type || '').startsWith('video/'),
      )
      if (needs.length === 0) {
        setStatus('All caught up — every video has a transcode.')
        setRunning(false)
        return
      }
      setStatus(`Dispatching transcode for ${needs.length} vlog${needs.length === 1 ? '' : 's'}…`)
      let ok = 0
      const failed: string[] = []
      for (let i = 0; i < needs.length; i++) {
        const v = needs[i]
        setStatus(`Re-transcoding ${i + 1} / ${needs.length}…`)
        try {
          const resp = await fetch(`/api/v2/vlogs/${v.id}/process`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'cheap' }),
          })
          if (!resp.ok) {
            const txt = await resp.text()
            failed.push(`${v.original_filename || v.id}: ${txt.slice(0, 120)}`)
          } else {
            ok += 1
          }
        } catch (err: any) {
          failed.push(`${v.original_filename || v.id}: ${err?.message || 'unknown'}`)
        }
      }
      setStatus(`Done. Dispatched ${ok} of ${needs.length}. The workflow will run each in the background — refresh the gallery in a few minutes.`)
      setErrors(failed)
    } catch (err: any) {
      setStatus(`Failed: ${err?.message || String(err)}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 0' }}>
      <button
        onClick={run}
        disabled={running}
        style={{
          alignSelf: 'flex-start',
          background: running ? 'var(--bg-3)' : 'var(--sig)',
          color: running ? 'var(--fg-3)' : 'white',
          border: 'none',
          padding: '10px 18px',
          borderRadius: 8,
          fontSize: 13,
          fontFamily: 'var(--font-body)',
          cursor: running ? 'not-allowed' : 'pointer',
          letterSpacing: -0.1,
        }}
      >
        {running ? 'Dispatching…' : 'Re-transcode videos with no H.264'}
      </button>
      {status && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)',
          letterSpacing: 0.8,
        }}>
          {status}
        </div>
      )}
      {errors.length > 0 && (
        <details style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--t-terra)' }}>
            {errors.length} failed to dispatch
          </summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--fg-3)' }}>
            {errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
            {errors.length > 20 && <li>…{errors.length - 20} more</li>}
          </ul>
        </details>
      )}
    </div>
  )
}
