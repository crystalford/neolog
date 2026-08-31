'use client'

/**
 * ClipsList — the Clips tab body on /drafts.
 *
 * Extracted from the former standalone /clips page (now a redirect to
 * /drafts?tab=clips). Every scored line worth cutting, across all vlogs —
 * the browsable version of the clip-quality judge's output.
 *
 * With a large back-catalog, most candidates start unscored. This
 * component finds that out on load and drives the judging itself — no
 * button-mashing required: it calls POST /api/v2/clips/score-more in a
 * loop, refreshing the feed after each batch, until the backlog clears or
 * the operator pauses it. The same backlog also drains in the background
 * via the cron-fired refresh-drafts endpoint, so it keeps making progress
 * even with this tab closed.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface ClipLine {
  id: string
  vlog_id: string
  vlog_title: string | null
  vlog_recorded_at: string | null
  start_time: number
  end_time: number
  headline: string
  quote: string | null
  clippability_score: number | null
  clippability_verdict: string | null
  suggested_caption_hook: string | null
  status: string
}
interface Coverage { total: number; judged: number; eligible_unjudged: number }

const MIN_SCORE_OPTIONS = [
  { value: 4, label: 'Score 4+ (would travel)' },
  { value: 3, label: 'Score 3+ (decent)' },
  { value: 1, label: 'Everything judged' },
]

// Delay between auto-loop batches. Not zero — gives D1/Workers AI room to
// breathe and keeps the "is it stuck or working" perception honest.
const AUTO_LOOP_DELAY_MS = 1500

export function ClipsList() {
  const router = useRouter()
  const [lines, setLines] = useState<ClipLine[] | null>(null)
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [minScore, setMinScore] = useState(4)
  const [autoRunning, setAutoRunning] = useState(true)
  const [totalScoredThisSession, setTotalScoredThisSession] = useState(0)
  const [scoreNote, setScoreNote] = useState<string | null>(null)
  const [shipping, setShipping] = useState<string | null>(null)
  const runningRef = useRef(false)
  const pausedRef = useRef(false)

  const load = useCallback(async (score: number) => {
    try {
      const r = await fetch(`/api/v2/clips?min_score=${score}&limit=150`, { credentials: 'include' })
      const d: any = await r.json()
      setLines(Array.isArray(d?.lines) ? d.lines : [])
      setCoverage(d?.coverage ?? null)
      return d?.coverage as Coverage | undefined
    } catch { setLines([]); return undefined }
  }, [])

  useEffect(() => { load(minScore) }, [minScore, load])

  useEffect(() => {
    pausedRef.current = !autoRunning
    if (!autoRunning || runningRef.current) return
    runningRef.current = true
    let cancelled = false

    const loop = async () => {
      while (!cancelled && !pausedRef.current) {
        let res: any
        try {
          const r = await fetch('/api/v2/clips/score-more', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ max_vlogs: 5, max_per_vlog: 8 }),
          })
          res = await r.json()
          if (!r.ok) throw new Error(res?.error || `HTTP ${r.status}`)
        } catch (e: any) {
          if (!cancelled) setScoreNote(`Paused — scoring failed: ${e?.message || e}`)
          break
        }
        if (cancelled) break
        if (res.judged > 0) {
          setTotalScoredThisSession(n => n + res.judged)
          const cov = await load(minScore)
          if (cov && cov.eligible_unjudged <= 0) break
        } else if (res.vlogs_processed === 0) {
          break
        }
        await new Promise(resolve => setTimeout(resolve, AUTO_LOOP_DELAY_MS))
      }
      runningRef.current = false
    }
    loop()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunning])

  const cut = async (id: string) => {
    setShipping(id)
    try {
      const r = await fetch(`/api/v2/clip-candidates/${id}/ship-as-short`, {
        method: 'POST', credentials: 'include',
      })
      const d: any = await r.json()
      if (!r.ok || !d?.production_id) throw new Error(d?.error || `HTTP ${r.status}`)
      router.push(`/production/${d.production_id}`)
    } catch (e: any) {
      setShipping(null)
      setScoreNote(`Cut failed: ${e?.message || e}`)
    }
  }

  return (
    <div>
      {coverage && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '10px 14px', border: '1px solid var(--line-1)', borderRadius: 10,
          background: 'var(--bg-1)', marginBottom: 18,
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: coverage.eligible_unjudged > 0 && autoRunning ? 'var(--sig)' : 'var(--fg-4)',
            boxShadow: coverage.eligible_unjudged > 0 && autoRunning ? '0 0 8px var(--sig-glow)' : 'none',
            animation: coverage.eligible_unjudged > 0 && autoRunning ? 'canon-pulse 1.6s ease-in-out infinite' : 'none',
            flexShrink: 0,
          }}/>
          <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>
            <strong style={{ color: 'var(--fg)' }}>{coverage.judged}</strong> of{' '}
            <strong style={{ color: 'var(--fg)' }}>{coverage.total}</strong> candidates scored
            {coverage.eligible_unjudged > 0 && (
              <span style={{ color: 'var(--fg-4)' }}>
                {' '}· {coverage.eligible_unjudged} waiting
                {autoRunning ? ' · finding clips now…' : ' · paused'}
              </span>
            )}
            {totalScoredThisSession > 0 && (
              <span style={{ color: 'var(--fg-4)' }}> · {totalScoredThisSession} scored this visit</span>
            )}
          </span>
          {coverage.eligible_unjudged > 0 && (
            <button
              onClick={() => setAutoRunning(v => !v)}
              className="canon-btn"
              style={{ fontSize: 12, padding: '5px 12px', marginLeft: 'auto' }}
            >
              {autoRunning ? 'Pause' : 'Resume'}
            </button>
          )}
        </div>
      )}
      {scoreNote && <div style={{ fontSize: 12.5, color: 'var(--fg-2)', marginBottom: 14 }}>{scoreNote}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
        {MIN_SCORE_OPTIONS.map(o => (
          <button key={o.value} onClick={() => setMinScore(o.value)}
            className={`canon-filter-chip ${minScore === o.value ? 'active' : ''}`}>
            {o.label}
          </button>
        ))}
      </div>

      {lines === null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0,1,2].map(i => <div key={i} className="neolog-skeleton" style={{ height: 110, opacity: 1 - i*0.2 }}/>)}
        </div>
      )}

      {lines !== null && lines.length === 0 && (
        <div style={{
          padding: '40px 28px', textAlign: 'center', border: '1px dashed var(--line-2)',
          borderRadius: 14, color: 'var(--fg-3)', fontSize: 14.5, lineHeight: 1.6,
        }}>
          {coverage && coverage.eligible_unjudged > 0
            ? 'No lines at this score yet — it\'s finding clips in your backlog right now. Leave this open for a bit, or check back shortly.'
            : 'Nothing scored at this threshold. Try a lower score, or upload more vlogs.'}
        </div>
      )}

      {lines !== null && lines.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 60 }}>
          {lines.map(l => <ClipLineCard key={l.id} line={l} onCut={cut} shipping={shipping === l.id}/>)}
        </div>
      )}
    </div>
  )
}

function ClipLineCard({ line, onCut, shipping }: { line: ClipLine; onCut: (id: string) => void; shipping: boolean }) {
  const dur = Math.max(0, Math.round(line.end_time - line.start_time))
  const score = line.clippability_score ?? 0
  const accent = score >= 4 ? 'var(--sig)' : score === 3 ? 'var(--t-ochre)' : 'var(--fg-4)'
  return (
    <div style={{
      padding: '18px 20px', borderRadius: 12, background: 'var(--bg-1)',
      border: '1px solid var(--line-1)', borderLeft: `3px solid ${accent}`,
    }}>
      <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
        {[1,2,3,4,5].map(i => (
          <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i <= score ? accent : 'var(--bg-4)' }}/>
        ))}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', marginLeft: 8 }}>
          {dur}s{line.vlog_recorded_at ? ` · ${new Date(line.vlog_recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
          {line.vlog_title ? ` · ${line.vlog_title}` : ''}
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 400, lineHeight: 1.45,
        color: 'var(--fg)', fontStyle: 'italic', marginBottom: line.clippability_verdict ? 10 : 14,
      }}>
        &ldquo;{line.quote || line.headline}&rdquo;
      </div>
      {line.clippability_verdict && (
        <div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginBottom: 14, lineHeight: 1.4 }}>
          {line.clippability_verdict}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onCut(line.id)}
          disabled={shipping}
          className="canon-btn primary"
          style={{ fontSize: 12.5, padding: '6px 14px' }}
        >
          {shipping ? 'Cutting…' : 'Cut clip →'}
        </button>
        <Link
          href={`/clips/${line.id}/edit`}
          className="canon-btn"
          style={{ fontSize: 12.5, padding: '6px 14px', textDecoration: 'none' }}
        >
          Extend / trim
        </Link>
      </div>
    </div>
  )
}
