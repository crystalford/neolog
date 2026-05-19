/**
 * System — pipeline status, dependency health, recent failures.
 * Operator's admin view + AI assistant's go-to for "what's broken now."
 */
'use client'

import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'

interface DependencyResult {
  ok: boolean
  ms: number
  detail?: string
  error?: string
}

interface RecentFailure {
  id: string
  vlog_id: string
  step: string
  status: string
  runtime: string | null
  worker_version: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  error_full_text: string | null
}

interface SystemStatus {
  dependencies: {
    d1: DependencyResult
    r2: DependencyResult
    ffmpeg_container: DependencyResult
    workers_ai: DependencyResult
    workflow_dispatch: DependencyResult
  }
  vlog_total: number
  vlog_complete: number
  vlog_transcribing: number
  vlog_extracting: number
  vlog_archived: number
  vlog_error: number
  thread_total: number
  cluster_total: number
  prompts_active: number
  recent_failures: RecentFailure[]
}

export default function SystemPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/v2/system/status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { setStatus(d); setLastFetchedAt(Date.now()) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  return (
    <Shell active="system" breadcrumb={['System']}>
    <div className="pad">
      <section className="hero">
        <div className="crumb reveal d2">Infrastructure</div>
        <h1 className="reveal d3">System</h1>
        <p className="lead reveal d4">Live dependency health, pipeline counts, and recent failures with untruncated error text.</p>
      </section>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 24px 12px' }}>
        <button onClick={load} disabled={loading} style={pillStyle(loading)}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        {lastFetchedAt && (
          <span style={{ fontSize: 12, color: 'var(--bone-3)', fontFamily: 'JetBrains Mono, monospace' }}>
            updated {Math.max(0, Math.round((Date.now() - lastFetchedAt) / 1000))}s ago
          </span>
        )}
      </div>

      <div className="settings-grid reveal d5" style={{ paddingTop: 8 }}>
        <div className="settings-section">
          <div className="label">Dependency health</div>
          <DepRow name="D1 database" r={status?.dependencies?.d1} />
          <DepRow name="R2 (neolog-videos)" r={status?.dependencies?.r2} />
          <DepRow name="FFmpeg container" r={status?.dependencies?.ffmpeg_container} />
          <DepRow name="Workers AI" r={status?.dependencies?.workers_ai} />
          <DepRow name="Workflow dispatch" r={status?.dependencies?.workflow_dispatch} />
        </div>

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
      </div>

      {status?.recent_failures && status.recent_failures.length > 0 && (
        <section style={{ padding: '16px 24px' }}>
          <h2 style={{ fontSize: 14, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--bone-2)', marginBottom: 12 }}>
            Recent failures (last 24h, {status.recent_failures.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {status.recent_failures.map(f => (
              <details key={f.id} style={{
                background: 'var(--ink-2)',
                border: '1px solid var(--state-err)',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 12,
                fontFamily: 'JetBrains Mono, monospace',
                color: 'var(--bone-1)',
              }}>
                <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
                  <strong style={{ color: 'var(--state-err)' }}>✗ {f.step}</strong>
                  {' · '}<a href={`/timeline/${f.vlog_id}`} style={{ color: 'var(--bone-2)' }}>{f.vlog_id.slice(-6)}</a>
                  {' · '}{f.runtime}{f.worker_version ? `@${f.worker_version}` : ''}
                  {' · '}{f.duration_ms ?? '?'}ms
                  {' · '}<span style={{ color: 'var(--bone-3)' }}>{f.started_at}</span>
                </summary>
                <pre style={{
                  marginTop: 8,
                  padding: 10,
                  background: 'var(--ink-1)',
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 11,
                  color: 'var(--bone-1)',
                }}>{f.error_full_text || '(no error text recorded)'}</pre>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
    </Shell>
  )
}

function DepRow({ name, r }: { name: string; r?: DependencyResult }) {
  const color = r === undefined
    ? 'var(--bone-3)'
    : r.ok
    ? 'var(--state-ok)'
    : 'var(--state-err)'
  const label = r === undefined
    ? '—'
    : r.ok
    ? `OK · ${r.ms}ms`
    : `FAIL · ${r.error || '(no error)'}`
  return (
    <div className="row">
      <div className="k">{name}</div>
      <div className="v" style={{ color, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r?.detail || r?.error || ''}>
        {label}
      </div>
    </div>
  )
}

function pillStyle(busy: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    border: '1px solid var(--line)',
    background: busy ? 'rgba(236,228,210,0.04)' : 'rgba(236,228,210,0.08)',
    color: 'var(--bone-1)',
    borderRadius: 100,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    cursor: busy ? 'wait' : 'pointer',
  }
}
