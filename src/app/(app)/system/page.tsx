/**
 * System — runtime observability for the operator (and Claude).
 * Reads /api/v2/admin/runtime-state and surfaces:
 *   - aggregates (vlogs, events 24h)
 *   - FFmpeg container health
 *   - recent failures with full untruncated error text
 *   - full pipeline_events timeline, filterable
 *
 * Auto-refreshes every 10s. Read-only. The point: when something
 * breaks, this page tells us why in one place — no more bespoke
 * diagnostic endpoints.
 */
'use client'

import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'

interface PipelineEvent {
  id: string
  vlog_id: string
  step: string
  sub_step: string | null
  status: 'started' | 'ok' | 'failed' | 'skipped'
  runtime: string | null
  worker_version: string | null
  request_id: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  error_full_text: string | null
  detail_json: string | null
  attempt: number
}

interface RecentFailure {
  vlog_id: string
  original_filename: string | null
  step: string
  error_full_text: string | null
  started_at: string
}

interface RuntimeState {
  generated_at: string
  operator_id: string
  filters: { limit: number; status: string | null; step: string | null; vlog_id: string | null }
  aggregates: {
    vlogs: {
      total: number
      complete: number
      failed: number
      processing: number
      archived: number
      has_transcoded: number
      has_thumb: number
    }
    events_by_step_status_24h: { step: string; status: string; n: number }[]
  }
  ffmpeg: { ok: boolean; status?: number; latency_ms?: number; error?: string }
  recent_failures: RecentFailure[]
  events: PipelineEvent[]
}

export default function SystemPage() {
  const [state, setState] = useState<RuntimeState | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [stepFilter, setStepFilter] = useState<string>('')
  const [vlogFilter, setVlogFilter] = useState<string>('')
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)

  const load = async () => {
    try {
      const params = new URLSearchParams({ limit_events: '200' })
      if (statusFilter) params.set('status', statusFilter)
      if (stepFilter) params.set('step', stepFilter)
      if (vlogFilter) params.set('vlog_id', vlogFilter)
      const r = await fetch(`/api/v2/admin/runtime-state?${params.toString()}`, { credentials: 'include' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = (await r.json()) as RuntimeState
      setState(d)
      setErr(null)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter, stepFilter, vlogFilter])
  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [autoRefresh, statusFilter, stepFilter, vlogFilter])

  return (
    <Shell>
      <div className="canon-wrap" style={{ padding: '8px 0 80px' }}>
        <header style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 18 }}>
          <h1 style={{
            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 56,
            letterSpacing: '-2.4px', color: 'var(--fg)', margin: 0,
          }}>System<span style={{ color: 'var(--sig)' }}>.</span></h1>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 1.8,
            textTransform: 'uppercase', color: 'var(--fg-3)',
          }}>
            {state?.generated_at ? new Date(state.generated_at).toLocaleTimeString() : (loading ? 'loading…' : 'idle')}
          </div>
          <label style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)',
          }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}/>
            auto-refresh 10s
          </label>
          <button onClick={load} style={ghostBtn}>refresh now</button>
        </header>

        {err && (
          <div style={{
            padding: 12, marginBottom: 14, borderRadius: 8,
            background: 'rgba(230,99,74,0.08)', border: '1px solid var(--t-terra)',
            color: 'var(--t-terra)', fontFamily: 'var(--font-mono)', fontSize: 12,
          }}>
            Failed to load runtime state: {err}
          </div>
        )}

        {state && (
          <>
            {/* Aggregates */}
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 18 }}>
              <Cell n={state.aggregates.vlogs.total}          l="total"/>
              <Cell n={state.aggregates.vlogs.complete}       l="complete"/>
              <Cell n={state.aggregates.vlogs.processing}     l="processing"/>
              <Cell n={state.aggregates.vlogs.failed}         l="failed" terra={state.aggregates.vlogs.failed > 0}/>
              <Cell n={state.aggregates.vlogs.archived}       l="archived"/>
              <Cell n={state.aggregates.vlogs.has_transcoded} l="w/ H.264"
                    terra={state.aggregates.vlogs.has_transcoded < state.aggregates.vlogs.total}/>
              <Cell n={state.aggregates.vlogs.has_thumb}      l="w/ thumb"/>
            </section>

            {/* FFmpeg health */}
            <section style={{
              padding: '12px 14px', marginBottom: 18, borderRadius: 8,
              background: state.ffmpeg.ok ? 'rgba(91,141,246,0.06)' : 'rgba(230,99,74,0.08)',
              border: `1px solid ${state.ffmpeg.ok ? 'var(--line-1)' : 'var(--t-terra)'}`,
              fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-1)',
            }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 4 }}>
                FFmpeg container
              </div>
              {state.ffmpeg.ok
                ? <>OK · HTTP {state.ffmpeg.status} · {state.ffmpeg.latency_ms}ms</>
                : <>FAIL · {state.ffmpeg.error || `HTTP ${state.ffmpeg.status}`} · {state.ffmpeg.latency_ms ?? '?'}ms</>}
            </section>

            {/* Recent failures */}
            {state.recent_failures.length > 0 && (
              <section style={{ marginBottom: 22 }}>
                <h2 style={sectionHead}>Recent failures · {state.recent_failures.length}</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {state.recent_failures.map((f, i) => (
                    <details key={`${f.vlog_id}-${i}`} style={{
                      padding: '8px 12px', borderRadius: 6,
                      background: 'var(--bg-1)', border: '1px solid var(--line-1)',
                      borderLeft: '2px solid var(--t-terra)',
                    }}>
                      <summary style={{ cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center', fontSize: 12 }}>
                        <span style={mono10('var(--t-terra)')}>{f.step}</span>
                        <span style={{ color: 'var(--fg-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.original_filename || f.vlog_id}
                        </span>
                        <span style={mono10('var(--fg-4)')}>{new Date(f.started_at).toLocaleString()}</span>
                        <a href={`/vlog/${f.vlog_id}`} style={{ color: 'var(--sig)', fontSize: 11 }}>open →</a>
                      </summary>
                      <pre style={errPre}>{f.error_full_text || '<no error text>'}</pre>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {/* Events 24h aggregate */}
            <section style={{ marginBottom: 22 }}>
              <h2 style={sectionHead}>Events by step · last 24h</h2>
              <table style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--fg-3)', textAlign: 'left', borderBottom: '1px solid var(--line-1)' }}>
                    <th style={th}>step</th>
                    <th style={th}>status</th>
                    <th style={th}>count</th>
                  </tr>
                </thead>
                <tbody>
                  {state.aggregates.events_by_step_status_24h.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line-1)' }}>
                      <td style={td}>{row.step}</td>
                      <td style={{ ...td, color: row.status === 'failed' ? 'var(--t-terra)' : row.status === 'ok' ? 'var(--fg-1)' : 'var(--fg-3)' }}>{row.status}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{row.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Event timeline + filters */}
            <section>
              <h2 style={sectionHead}>Pipeline events · {state.events.length}</h2>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={filterInput}>
                  <option value="">all status</option>
                  <option value="failed">failed</option>
                  <option value="ok">ok</option>
                  <option value="started">started</option>
                  <option value="skipped">skipped</option>
                </select>
                <input placeholder="step contains…" value={stepFilter} onChange={e => setStepFilter(e.target.value)} style={filterInput}/>
                <input placeholder="vlog_id" value={vlogFilter} onChange={e => setVlogFilter(e.target.value)} style={{ ...filterInput, minWidth: 280 }}/>
                {(statusFilter || stepFilter || vlogFilter) && (
                  <button onClick={() => { setStatusFilter(''); setStepFilter(''); setVlogFilter('') }} style={ghostBtn}>clear</button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {state.events.map(ev => {
                  const isExp = expandedEvent === ev.id
                  const color = ev.status === 'failed' ? 'var(--t-terra)'
                    : ev.status === 'ok' ? 'var(--t-sage)'
                    : ev.status === 'skipped' ? 'var(--fg-4)'
                    : 'var(--sig)'
                  return (
                    <div key={ev.id} style={{
                      padding: '6px 10px', borderRadius: 4,
                      background: 'var(--bg-1)', border: '1px solid var(--line-1)',
                      borderLeft: `2px solid ${color}`,
                      fontFamily: 'var(--font-mono)', fontSize: 11,
                      cursor: 'pointer',
                    }} onClick={() => setExpandedEvent(isExp ? null : ev.id)}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ color, minWidth: 60 }}>{ev.status}</span>
                        <span style={{ color: 'var(--fg-1)', minWidth: 180 }}>{ev.step}{ev.sub_step ? `·${ev.sub_step}` : ''}</span>
                        <span style={{ color: 'var(--fg-3)', minWidth: 80 }}>
                          {ev.duration_ms != null ? `${ev.duration_ms}ms` : '—'}
                        </span>
                        <a href={`/vlog/${ev.vlog_id}`} onClick={e => e.stopPropagation()} style={{
                          color: 'var(--fg-3)', fontSize: 10, minWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{ev.vlog_id}</a>
                        <span style={{ color: 'var(--fg-4)', marginLeft: 'auto' }}>
                          {new Date(ev.started_at).toLocaleTimeString()}
                        </span>
                      </div>
                      {isExp && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line-1)' }}>
                          {ev.error_full_text && (
                            <>
                              <div style={mono10('var(--t-terra)')}>error_full_text</div>
                              <pre style={errPre}>{ev.error_full_text}</pre>
                            </>
                          )}
                          {ev.detail_json && (
                            <>
                              <div style={{ ...mono10('var(--fg-3)'), marginTop: 8 }}>detail_json</div>
                              <pre style={errPre}>{tryPretty(ev.detail_json)}</pre>
                            </>
                          )}
                          <div style={{ ...mono10('var(--fg-4)'), marginTop: 8 }}>
                            runtime={ev.runtime || '?'} · worker={ev.worker_version || '?'} · request={ev.request_id || '?'} · attempt={ev.attempt}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {state.events.length === 0 && (
                  <div style={{ padding: 14, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    No events match.
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </Shell>
  )
}

function Cell({ n, l, terra }: { n: number; l: string; terra?: boolean }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      background: 'var(--bg-1)', border: `1px solid ${terra ? 'var(--t-terra)' : 'var(--line-1)'}`,
    }}>
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 28, fontWeight: 400, lineHeight: 1,
        color: terra ? 'var(--t-terra)' : 'var(--fg)',
      }}>{n.toLocaleString()}</div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: 1.3,
        textTransform: 'uppercase', color: 'var(--fg-3)', marginTop: 4,
      }}>{l}</div>
    </div>
  )
}

function tryPretty(json: string): string {
  try { return JSON.stringify(JSON.parse(json), null, 2) } catch { return json }
}

const sectionHead: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
  textTransform: 'uppercase', color: 'var(--fg-3)', margin: '0 0 10px',
}
const mono10 = (color: string): React.CSSProperties => ({
  fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: 1.3,
  textTransform: 'uppercase', color,
})
const errPre: React.CSSProperties = {
  margin: '4px 0 0', padding: '8px 10px',
  background: 'var(--bg-2)', border: '1px solid var(--line-1)',
  borderRadius: 4, fontSize: 11, lineHeight: 1.4, color: 'var(--fg-1)',
  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  maxHeight: 320, overflow: 'auto',
}
const ghostBtn: React.CSSProperties = {
  background: 'transparent', color: 'var(--fg-2)',
  border: '1px solid var(--line-2)', borderRadius: 6,
  padding: '5px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
  cursor: 'pointer', letterSpacing: 1,
}
const filterInput: React.CSSProperties = {
  background: 'var(--bg-2)', color: 'var(--fg-1)',
  border: '1px solid var(--line-1)', borderRadius: 6,
  padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 11,
  minWidth: 130,
}
const th: React.CSSProperties = {
  padding: '6px 8px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 10,
}
const td: React.CSSProperties = { padding: '5px 8px', color: 'var(--fg-1)' }
