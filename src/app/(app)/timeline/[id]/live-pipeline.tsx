'use client'

/**
 * Live pipeline status component for /timeline/[id].
 *
 * Replaces the static "Thumbnail extraction ✓ / Video transcode ⋯" block.
 * Subscribes to /api/v2/vlogs/[id]/ws via the VlogPipelineDO and renders
 * the most recent event per (step, sub_step) — so the operator sees
 * actual byte-level / chunk-level / token-level progress in real time
 * instead of guessing whether the pipeline is wedged.
 *
 * On WS disconnect: exponential backoff reconnect (0.5s, 1s, 2s, 4s, …
 * capped at 15s) plus a fallback poll every 5s to /api/v2/vlogs/[id]/events.
 *
 * Each step card shows:
 *   - title + status badge (starting / running / ok / retrying / error / failed / skipped)
 *   - current sub-step description in plain English (parsed from detail_json)
 *   - progress bar where applicable (pct, done/total, etc.)
 *   - "View full log" disclosure with every event, untruncated
 */

import { useEffect, useReducer, useRef } from 'react'

export interface PipelineEvent {
  id?: number
  vlog_id: string
  operator_id: string
  step: string
  sub_step: string | null
  status: 'starting' | 'running' | 'ok' | 'error' | 'retrying' | 'failed_terminal' | 'skipped'
  started_at?: number
  ts: number
  duration_ms?: number | null
  detail_json: string
  error_full_text?: string | null
  attempt?: number
}

type StepKey = 'audio_extract' | 'transcribe' | 'extract'
const STEPS: { key: StepKey; label: string }[] = [
  { key: 'audio_extract', label: 'Audio extract' },
  { key: 'transcribe', label: 'Transcribe' },
  { key: 'extract', label: 'Extract threads / clips / entities' },
]

interface State {
  // 'idle' before first WS open attempt, 'connected' after onopen,
  // 'reconnecting' only after a drop. Avoids the "RECONNECTING…" lie
  // that flashed when the page just loaded.
  conn: 'idle' | 'connecting' | 'connected' | 'reconnecting'
  events: PipelineEvent[]   // append-only, max ~500 to bound memory
  expanded: Record<StepKey, boolean>
}

type Action =
  | { type: 'connecting' }
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'snapshot'; events: PipelineEvent[] }
  | { type: 'event'; event: PipelineEvent }
  | { type: 'toggle'; step: StepKey }

const initial: State = {
  conn: 'idle',
  events: [],
  expanded: { audio_extract: false, transcribe: false, extract: false },
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'connecting': return { ...state, conn: state.conn === 'connected' ? 'reconnecting' : 'connecting' }
    case 'connected': return { ...state, conn: 'connected' }
    case 'disconnected': return { ...state, conn: state.conn === 'connected' ? 'reconnecting' : state.conn }
    case 'snapshot': {
      // de-dupe by id; snapshot events from DO arrive ordered by ts ASC
      const seen = new Set(state.events.map(e => e.id).filter(x => x != null))
      const merged = [...state.events, ...action.events.filter(e => e.id == null || !seen.has(e.id))]
      merged.sort((a, b) => a.ts - b.ts)
      return { ...state, events: merged.slice(-500) }
    }
    case 'event': {
      const seen = new Set(state.events.map(e => e.id).filter(x => x != null))
      if (action.event.id != null && seen.has(action.event.id)) return state
      return { ...state, events: [...state.events, action.event].slice(-500) }
    }
    case 'toggle': return { ...state, expanded: { ...state.expanded, [action.step]: !state.expanded[action.step] } }
  }
}

export default function LivePipeline({ vlogId }: { vlogId: string }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const aliveRef = useRef(true)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    aliveRef.current = true

    // Periodic poll as a safety net — if WS is down, /events still works.
    pollTimerRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/v2/vlogs/${vlogId}/events`, { credentials: 'include' })
        if (!r.ok) return
        const data = await r.json() as { events?: PipelineEvent[] }
        if (data.events?.length) dispatch({ type: 'snapshot', events: data.events })
      } catch {}
    }, 5000)

    const connect = () => {
      if (!aliveRef.current) return
      dispatch({ type: 'connecting' })
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/api/v2/vlogs/${vlogId}/ws`)
      wsRef.current = ws
      ws.onopen = () => {
        retriesRef.current = 0
        dispatch({ type: 'connected' })
      }
      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data) as
            | { type: 'snapshot'; events: PipelineEvent[] }
            | { type: 'event'; event: PipelineEvent }
          if (parsed.type === 'snapshot') dispatch({ type: 'snapshot', events: parsed.events })
          else if (parsed.type === 'event') dispatch({ type: 'event', event: parsed.event })
        } catch {}
      }
      ws.onclose = () => {
        dispatch({ type: 'disconnected' })
        if (!aliveRef.current) return
        const wait = Math.min(15000, 500 * 2 ** retriesRef.current++)
        setTimeout(connect, wait)
      }
      ws.onerror = () => { try { ws.close() } catch {} }
    }
    connect()

    return () => {
      aliveRef.current = false
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      try { wsRef.current?.close() } catch {}
    }
  }, [vlogId])

  const eventsByStep: Record<StepKey, PipelineEvent[]> = {
    audio_extract: state.events.filter(e => e.step === 'audio_extract'),
    transcribe: state.events.filter(e => e.step === 'transcribe'),
    extract: state.events.filter(e => e.step === 'extract'),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
        color: state.conn === 'connected' ? 'var(--state-ok, #7a9a6a)' : 'var(--bone-3)',
        letterSpacing: 1.2, textTransform: 'uppercase',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: state.conn === 'connected' ? 'var(--state-ok, #7a9a6a)' : 'var(--bone-3)',
        }} />
        {state.conn === 'connected' ? 'live'
          : state.conn === 'connecting' ? 'connecting…'
          : state.conn === 'reconnecting' ? 'reconnecting…'
          : 'idle'}
        {state.events.length > 0 && (
          <span style={{ marginLeft: 'auto', opacity: 0.6 }}>{state.events.length} events</span>
        )}
      </div>
      {STEPS.map(step => (
        <StepCard
          key={step.key}
          label={step.label}
          events={eventsByStep[step.key]}
          expanded={state.expanded[step.key]}
          onToggle={() => dispatch({ type: 'toggle', step: step.key })}
        />
      ))}
    </div>
  )
}

function StepCard({
  label,
  events,
  expanded,
  onToggle,
}: {
  label: string
  events: PipelineEvent[]
  expanded: boolean
  onToggle: () => void
}) {
  const last = events.at(-1)
  if (!last) {
    return (
      <article style={cardStyle('idle')}>
        <header style={headerRow}>
          <h3 style={titleStyle}>{label}</h3>
          <StatusBadge status="idle" />
        </header>
        <div style={{ fontSize: 12, color: 'var(--bone-3)' }}>Waiting…</div>
      </article>
    )
  }

  const detail = safeParse(last.detail_json)
  const description = describeSubstep(last.step, last.sub_step, detail)
  const pct = typeof detail.pct === 'number' ? detail.pct as number : null
  const done = typeof detail.done === 'number' ? detail.done as number : null
  const total = typeof detail.total === 'number' ? detail.total as number : null

  return (
    <article style={cardStyle(last.status)}>
      <header style={headerRow}>
        <h3 style={titleStyle}>{label}</h3>
        <StatusBadge status={last.status} />
      </header>
      <div style={{ fontSize: 13, color: 'var(--bone-1)', marginTop: 6 }}>
        {description}
      </div>
      {pct != null && <ProgressBar pct={pct} label={`${pct.toFixed(1)}%`} />}
      {done != null && total != null && total > 0 &&
        <ProgressBar pct={(done / total) * 100} label={`${done}/${total}`} />}
      {last.status === 'retrying' && (
        <div style={{
          marginTop: 6, fontSize: 11, color: 'var(--state-warn, #b8915f)',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          Retry attempt {String(detail.attempt ?? last.attempt ?? '?')} in {detail.next_in_ms ? `${Math.round(Number(detail.next_in_ms) / 1000)}s` : '—'}
        </div>
      )}
      {(last.status === 'error' || last.status === 'failed_terminal') && last.error_full_text && (
        <pre style={errorBlock}>{last.error_full_text}</pre>
      )}
      <button
        onClick={onToggle}
        style={{
          marginTop: 8, padding: '4px 8px', fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: 1.2, textTransform: 'uppercase',
          background: 'transparent', border: '1px solid var(--line)',
          borderRadius: 4, cursor: 'pointer', color: 'var(--bone-3)',
        }}
      >
        {expanded ? 'Hide log' : `View full log (${events.length})`}
      </button>
      {expanded && (
        <ol style={logList}>
          {events.map((e, i) => (
            <li key={e.id ?? i} style={logRow}>
              <span style={{ color: 'var(--bone-3)', minWidth: 80 }}>
                {new Date(e.ts).toLocaleTimeString('en-US', { hour12: false })}
              </span>
              <span style={{ color: 'var(--bone-1)' }}>{e.sub_step || e.step}</span>
              <span style={{ color: statusColor(e.status), minWidth: 80 }}>{e.status}</span>
              {e.duration_ms != null && (
                <span style={{ color: 'var(--bone-3)' }}>{e.duration_ms} ms</span>
              )}
              <code style={{ flex: 1, fontSize: 10, color: 'var(--bone-3)' }}>
                {e.detail_json.length > 300 ? e.detail_json.slice(0, 300) + '…' : e.detail_json}
              </code>
              {e.error_full_text && (
                <pre style={{ ...errorBlock, marginTop: 4 }}>{e.error_full_text}</pre>
              )}
            </li>
          ))}
        </ol>
      )}
    </article>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      padding: '2px 8px',
      fontSize: 10,
      fontFamily: 'JetBrains Mono, monospace',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      borderRadius: 4,
      color: statusColor(status),
      background: 'transparent',
      border: `1px solid ${statusColor(status)}`,
    }}>
      {status}
    </span>
  )
}

function ProgressBar({ pct, label }: { pct: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{
        position: 'relative', height: 4, borderRadius: 2,
        background: 'var(--ink-2)', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${clamped}%`, background: 'var(--bone-1)',
          transition: 'width 200ms ease-out',
        }} />
      </div>
      {label && (
        <div style={{
          marginTop: 4, fontSize: 10, color: 'var(--bone-3)',
          fontFamily: 'JetBrains Mono, monospace',
        }}>{label}</div>
      )}
    </div>
  )
}

function describeSubstep(step: string, sub: string | null, d: Record<string, unknown>): string {
  if (step === 'audio_extract') {
    if (sub === 'probe') return `Probed: ${d.duration_sec ?? '?'}s, codec ${d.codec ?? '?'}`
    if (sub === 'ffmpeg') {
      const t = d.time_sec, dur = d.duration_sec, speed = d.speed_x
      if (typeof t === 'number' && typeof dur === 'number') {
        return `ffmpeg @ ${t.toFixed(1)}s / ${dur.toFixed(0)}s${typeof speed === 'number' ? ` (${speed.toFixed(2)}× realtime)` : ''}`
      }
    }
    if (sub === 'upload_chunks') return `Uploading audio chunks ${d.done ?? 0}/${d.total ?? '?'} (${formatBytes(Number(d.bytes_uploaded ?? 0))})`
  }
  if (step === 'transcribe') {
    if (sub?.startsWith('chunk_')) {
      const idx = Number(sub.slice(6))
      return `Chunk ${idx + 1}/${d.of ?? '?'} — attempt ${d.attempt ?? 1}${d.chars_out ? ` → ${d.chars_out} chars` : ''}`
    }
  }
  if (step === 'extract') {
    if (sub === 'llm_call') return `${d.model ?? '?'} — ${d.input_tokens ?? '?'} tokens in, ${d.output_tokens ?? '…'} tokens out`
    if (sub === 'llm_validate') return `Validator: ${d.valid ?? '?'}/${d.total ?? '?'} grounded, ${((Number(d.fail_rate ?? 0)) * 100).toFixed(1)}% failed`
    if (sub === 'llm_escalate') return `Escalating from ${d.from ?? '?'} → ${d.to ?? '?'}: ${d.reason ?? ''}`
    if (sub === 'llm_persist') return `Persisted run: ${d.threads ?? 0} threads, ${d.clips ?? 0} clips, ${d.creative_elements ?? 0} creative, ${d.entities ?? 0} entities`
  }
  return sub || step
}

function statusColor(status: string): string {
  switch (status) {
    case 'ok': return 'var(--state-ok, #7a9a6a)'
    case 'running':
    case 'starting': return 'var(--bone-1)'
    case 'retrying': return 'var(--state-warn, #b8915f)'
    case 'error':
    case 'failed_terminal': return 'var(--state-err, #c66042)'
    case 'skipped': return 'var(--bone-3)'
    case 'idle': return 'var(--bone-3)'
    default: return 'var(--bone-3)'
  }
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1_000_000) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1_000_000_000) return `${(b / 1_000_000).toFixed(1)} MB`
  return `${(b / 1_000_000_000).toFixed(2)} GB`
}

function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) ?? {} } catch { return {} }
}

const cardStyle = (status: string): React.CSSProperties => ({
  padding: 12,
  border: `1px solid ${status === 'error' || status === 'failed_terminal' ? 'var(--state-err, #c66042)' : 'var(--line)'}`,
  background: 'var(--ink-2)',
  borderRadius: 8,
})

const headerRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
}

const titleStyle: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: 14, fontWeight: 500, color: 'var(--bone-1)', margin: 0,
}

const errorBlock: React.CSSProperties = {
  marginTop: 8, padding: 8,
  background: 'var(--ink-1)',
  border: '1px solid var(--state-err, #c66042)',
  borderRadius: 4,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
  color: 'var(--state-err, #c66042)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 320,
  overflow: 'auto',
}

const logList: React.CSSProperties = {
  marginTop: 8, padding: 0, listStyle: 'none',
  display: 'flex', flexDirection: 'column', gap: 4,
  maxHeight: 360, overflowY: 'auto',
  background: 'var(--ink-1)', borderRadius: 4,
  border: '1px solid var(--line)',
}

const logRow: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8,
  padding: '4px 8px', fontSize: 11,
  fontFamily: 'JetBrains Mono, monospace',
  borderBottom: '1px solid var(--line)',
}
