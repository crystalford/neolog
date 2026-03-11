'use client'

import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, Loader2, AlertCircle, Circle, SkipForward } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type LogStatus = 'running' | 'done' | 'error' | 'skipped'

type LogEntry = {
  step: string
  status: LogStatus
  ts: string
  detail?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Canonical ordered steps — any step in pipeline_log is shown inline;
// upcoming steps are rendered as pending placeholders.
const ORDERED_STEPS = [
  { key: 'preflight',         label: 'Function triggered' },
  { key: 'fetch-context',     label: 'Load upload + API keys' },
  { key: 'extract-audio',     label: 'Extract audio (Replicate FFmpeg)' },
  { key: 'extract-metadata',  label: 'Read file metadata' },
  { key: 'transcribe',        label: 'Transcribe (Whisper large-v3)' },
  { key: 'save-transcript',   label: 'Save transcript' },
  { key: 'analyze',           label: 'AI analysis' },
  { key: 'save-analysis',     label: 'Save analysis' },
  { key: 'upsert-entities',   label: 'Extract entities' },
]

const TERMINAL_STATUSES = new Set(['processed', 'error'])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function reltime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

function StatusIcon({ status }: { status: LogStatus | 'pending' }) {
  if (status === 'done')    return <CheckCircle2 size={13} className="text-green-400 flex-shrink-0" />
  if (status === 'running') return <Loader2 size={13} className="text-[var(--accent)] animate-spin flex-shrink-0" />
  if (status === 'error')   return <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
  if (status === 'skipped') return <SkipForward size={13} className="text-[var(--text-tertiary)] flex-shrink-0" />
  return <Circle size={13} className="text-[var(--border-medium)] flex-shrink-0" />
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  uploadId: string
  initialStatus: string
  initialPipelineLog?: LogEntry[]
  errorMessage?: string | null
}

export function UploadPipelineStatus({
  uploadId,
  initialStatus,
  initialPipelineLog = [],
  errorMessage: initialError,
}: Props) {
  const [log, setLog]         = useState<LogEntry[]>(initialPipelineLog)
  const [status, setStatus]   = useState(initialStatus)
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError || null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isTerminal = TERMINAL_STATUSES.has(status)

  const poll = async () => {
    try {
      const res = await fetch(`/api/video-upload/${uploadId}`)
      if (!res.ok) return
      const { upload } = await res.json()
      setLog(upload.pipeline_log || [])
      setStatus(upload.status)
      if (upload.error_message) setErrorMsg(upload.error_message)
    } catch {
      // best-effort
    }
  }

  useEffect(() => {
    if (!isTerminal) {
      poll()
      intervalRef.current = setInterval(poll, 3000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadId])

  useEffect(() => {
    if (TERMINAL_STATUSES.has(status) && intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [status])

  // Build a merged view: log entries + pending placeholders for future steps
  const loggedKeys = new Set(log.map(e => e.step))
  const lastLoggedIdx = (() => {
    let last = -1
    for (let i = ORDERED_STEPS.length - 1; i >= 0; i--) {
      if (loggedKeys.has(ORDERED_STEPS[i].key)) { last = i; break }
    }
    return last
  })()

  type Row = { key: string; label: string; entry: LogEntry | null; pending: boolean }
  const rows: Row[] = ORDERED_STEPS.map((s, i) => {
    const entry = log.filter(e => e.step === s.key).at(-1) || null // most recent for this step
    const pending = !entry && i > lastLoggedIdx
    return { key: s.key, label: s.label, entry, pending }
  })

  // Status label
  const statusLabel: Record<string, string> = {
    uploaded: 'Waiting to process',
    transcribing: 'Transcribing audio...',
    analyzing: 'Analyzing...',
    processed: 'Done',
    error: 'Failed',
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--border-light)] overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-2.5 flex items-center gap-2 text-xs font-medium
        ${status === 'processed' ? 'bg-green-500/10 text-green-400' :
          status === 'error'     ? 'bg-red-500/10 text-red-400' :
          'bg-[var(--accent)]/8 text-[var(--accent)]'}`}>
        {status === 'processed' ? (
          <CheckCircle2 size={13} />
        ) : status === 'error' ? (
          <AlertCircle size={13} />
        ) : (
          <Loader2 size={13} className="animate-spin" />
        )}
        <span className="font-mono uppercase tracking-wider text-[10px]">
          {statusLabel[status] || status}
        </span>
        {!isTerminal && (
          <span className="ml-auto font-mono text-[9px] opacity-60">polling every 3s</span>
        )}
      </div>

      {/* Step list */}
      <div className="divide-y divide-[var(--border-light)]">
        {rows.map(({ key, label, entry, pending }) => {
          const stepStatus: LogStatus | 'pending' = entry ? entry.status : pending ? 'pending' : 'pending'
          // Find the most recent 'running' entry for the same step — could be multiple
          const isCurrentlyRunning = !isTerminal && entry?.status === 'running'

          return (
            <div
              key={key}
              className={`flex items-start gap-3 px-4 py-2.5 ${pending ? 'opacity-35' : ''}`}
            >
              <StatusIcon status={stepStatus} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-xs ${pending ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>
                    {label}
                  </span>
                  {entry && (
                    <span className="font-mono text-[9px] text-[var(--text-tertiary)] flex-shrink-0">
                      {reltime(entry.ts)}
                    </span>
                  )}
                </div>
                {entry?.detail && (
                  <p className="mt-0.5 text-[11px] text-[var(--text-secondary)] leading-snug font-mono">
                    {entry.detail}
                  </p>
                )}
                {isCurrentlyRunning && (
                  <p className="mt-0.5 text-[10px] text-[var(--accent)]/60 animate-pulse">working...</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="px-4 py-3 bg-red-500/10 border-t border-red-500/20">
          <p className="text-xs font-semibold text-red-400 mb-0.5">Error</p>
          <p className="text-xs text-red-300/80 leading-relaxed">{errorMsg}</p>
        </div>
      )}

      {/* Empty state: status is not processed/error but log is empty */}
      {log.length === 0 && !isTerminal && (
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-[var(--text-tertiary)]">
            Waiting for Inngest to pick up the event...
          </p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-1 font-mono">
            Check: INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY are set in Vercel env
          </p>
        </div>
      )}
    </div>
  )
}
