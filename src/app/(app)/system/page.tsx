/**
 * System — pipeline status, prompts, jobs, infrastructure visibility.
 * Operator's admin view.
 */
'use client'

import { useEffect, useState } from 'react'

interface SystemStatus {
  vlog_total: number
  vlog_complete: number
  vlog_transcribing: number
  vlog_extracting: number
  vlog_archived: number
  vlog_error: number
  thread_total: number
  cluster_total: number
  prompts_active: number
}

export default function SystemPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  useEffect(() => {
    fetch('/api/v2/system/status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(setStatus)
      .catch(() => {})
  }, [])

  return (
    <main>
      <section className="hero">
        <div className="crumb reveal d2">Infrastructure</div>
        <h1 className="reveal d3">System</h1>
        <p className="lead reveal d4">Pipeline status, prompts, jobs, and the substrate keeping the graph alive.</p>
      </section>

      <div className="settings-grid reveal d5" style={{ paddingTop: 8 }}>
        <div className="settings-section">
          <div className="label">Pipeline</div>
          <div className="row"><div className="k">Vlogs total</div><div className="v">{status?.vlog_total ?? '—'}</div></div>
          <div className="row"><div className="k">Complete</div><div className="v" style={{ color: 'var(--state-ok)' }}>{status?.vlog_complete ?? '—'}</div></div>
          <div className="row"><div className="k">Transcribing</div><div className="v">{status?.vlog_transcribing ?? '—'}</div></div>
          <div className="row"><div className="k">Extracting</div><div className="v">{status?.vlog_extracting ?? '—'}</div></div>
          <div className="row"><div className="k">Archived (skipped)</div><div className="v">{status?.vlog_archived ?? '—'}</div></div>
          <div className="row"><div className="k">Errored</div><div className="v" style={{ color: 'var(--state-err)' }}>{status?.vlog_error ?? '—'}</div></div>
        </div>

        <div className="settings-section">
          <div className="label">Substrate</div>
          <div className="row"><div className="k">Threads</div><div className="v">{status?.thread_total ?? '—'}</div></div>
          <div className="row"><div className="k">Clusters</div><div className="v">{status?.cluster_total ?? '—'}</div></div>
          <div className="row"><div className="k">Active prompts</div><div className="v">{status?.prompts_active ?? '—'}</div></div>
        </div>

        <div className="settings-section">
          <div className="label">Cloudflare</div>
          <div className="row"><div className="k">D1 database</div><div className="v">neolog</div></div>
          <div className="row"><div className="k">R2 bucket</div><div className="v">neolog-videos</div></div>
          <div className="row"><div className="k">FFmpeg container</div><div className="v">neolog-ffmpeg</div></div>
          <div className="row"><div className="k">Process-upload Workflow</div><div className="v">neolog-process-upload</div></div>
          <div className="row"><div className="k">Pages project</div><div className="v">neolog</div></div>
        </div>
      </div>
    </main>
  )
}
