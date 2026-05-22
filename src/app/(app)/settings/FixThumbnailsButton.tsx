'use client'

import { useState } from 'react'

interface BatchResult {
  next_cursor?: string | null
  processed?: Array<{ id: string; ok: boolean; error?: string; filename?: string }>
  remaining?: number
  done?: boolean
}

export function FixThumbnailsButton() {
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [errors, setErrors] = useState<string[]>([])
  const [processed, setProcessed] = useState(0)

  const run = async () => {
    if (running) return
    setRunning(true)
    setErrors([])
    setProcessed(0)
    setStatus('Scanning vlogs missing thumbnails…')
    let cursor: string | null | undefined = ''
    let totalOk = 0
    const collectedErrors: string[] = []
    try {
      for (let iter = 0; iter < 200; iter++) {
        const resp = await fetch('/api/v2/admin/fix-thumbnails-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ cursor: cursor || '', chunk_size: 2 }),
        })
        if (!resp.ok) {
          const text = await resp.text()
          throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`)
        }
        const data = (await resp.json()) as BatchResult
        const batch = data.processed ?? []
        for (const r of batch) {
          if (r.ok) totalOk += 1
          else collectedErrors.push(`${r.filename || r.id}: ${r.error || 'unknown'}`)
        }
        setProcessed(totalOk)
        setStatus(`Backfilled ${totalOk} thumbnail${totalOk === 1 ? '' : 's'} so far…`)
        if (data.done || !data.next_cursor) break
        cursor = data.next_cursor
      }
      setStatus(`Done. Backfilled ${totalOk} thumbnail${totalOk === 1 ? '' : 's'}.`)
      setErrors(collectedErrors)
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
        {running ? 'Backfilling…' : 'Backfill missing thumbnails'}
      </button>
      {status && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)',
          letterSpacing: 0.8,
        }}>
          {status}
          {processed > 0 && !running && ` · ${processed} fixed`}
        </div>
      )}
      {errors.length > 0 && (
        <details style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--t-terra)' }}>
            {errors.length} failed
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
