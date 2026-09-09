'use client'

/**
 * Free a recording wedged mid-pipeline.
 *
 * ── Why this is a button and not a cron ──────────────────────────────────
 *
 * `workers/healer` was written to do this on a schedule and its cron is
 * **off** — `crons = []` in its wrangler.toml, disabled as "pure ambient
 * cost on a single-operator app where genuinely-stuck workflows are rare".
 * That is right for a quiet log and exactly wrong for the one event this
 * product is built around: four hundred recordings through FFmpeg and
 * Whisper, where a stuck row is not rare at all.
 *
 * Its own module header still says "Runs every 5 minutes… stuck workflows
 * now self-recover", and nothing in the repo calls its fetch handler. So
 * until the operator decides to pay for the schedule, the honest form of
 * the job is a button he presses — which is the shape every maintenance job
 * takes here, because he has no terminal.
 *
 * `POST /api/v2/admin/reset-stuck` is the app-side equivalent: a pure D1
 * UPDATE, no model calls, no container starts, safe to re-run. It was
 * recorded in `check-unreached-routes.mjs`'s REACHED_ELSEWHERE rather than
 * wired to a surface, and that list is a record of decisions, not a way to
 * quiet the check.
 *
 * ⚠️ It counts before it changes anything. A dry run first, so the line says
 * how many are wedged and he presses again knowing the number — the same
 * shape the transcribe job uses, and the reason is the same: a job that
 * reports nothing before acting is indistinguishable from one that did
 * nothing.
 */

import { useState } from 'react'

interface Result {
  reset?: number
  dry_run?: boolean
  scope?: string
  stuck_minutes?: number
  sample_ids?: string[]
}

/** Long enough that a recording legitimately mid-Whisper is not touched. */
const STUCK_MINUTES = 20

export function FreeStuckButton() {
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [found, setFound] = useState<number | null>(null)

  const call = async (dryRun: boolean): Promise<Result> => {
    const res = await fetch('/api/v2/admin/reset-stuck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ scope: 'in_flight', stuck_minutes: STUCK_MINUTES, dry_run: dryRun }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return await res.json() as Result
  }

  const look = async () => {
    if (running) return
    setRunning(true); setStatus('Looking for wedged recordings…')
    try {
      const r = await call(true)
      const n = r.reset ?? 0
      setFound(n)
      setStatus(n === 0
        ? `Nothing has been stuck for more than ${STUCK_MINUTES} minutes.`
        : `${n} recording${n === 1 ? ' has' : 's have'} been stuck for more than ${STUCK_MINUTES} minutes.`)
    } catch (err: any) {
      setFound(null)
      setStatus(`That did not go through: ${err?.message || String(err)}`)
    } finally { setRunning(false) }
  }

  const free = async () => {
    if (running) return
    setRunning(true); setStatus('Freeing them…')
    try {
      const r = await call(false)
      const n = r.reset ?? 0
      setFound(0)
      setStatus(n === 0
        ? 'Nothing to free.'
        : `${n} freed. Transcribe them again from the panel above — nothing was deleted.`)
    } catch (err: any) {
      setStatus(`That did not go through: ${err?.message || String(err)}`)
    } finally { setRunning(false) }
  }

  const btn = (primary: boolean) => ({
    alignSelf: 'flex-start' as const,
    background: running ? 'var(--bg-3)' : primary ? 'var(--sig)' : 'none',
    color: running ? 'var(--fg-3)' : primary ? '#fff' : 'var(--fg-1)',
    border: primary ? 'none' : '1px solid var(--line-2)',
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'var(--font-body)',
    cursor: running ? 'not-allowed' as const : 'pointer' as const,
    letterSpacing: -0.1,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 0' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={look} disabled={running} style={btn(found === null || found === 0)}>
          {running ? 'Working…' : 'See how many are stuck'}
        </button>
        {found !== null && found > 0 && (
          <button onClick={free} disabled={running} style={btn(true)}>
            Free {found}
          </button>
        )}
      </div>
      {status && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
          {status}
        </div>
      )}
    </div>
  )
}
