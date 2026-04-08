'use client'export const runtime = 'edge'


import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sparkles, Loader2, TrendingUp, AlertCircle, Clock, RefreshCw } from 'lucide-react'

interface UserSynthesis {
  id: string
  synthesized_at: string
  upload_count: number
  spine: string
  narratives: any[]
  themes: any[]
  contradictions: any[]
  commitments_open: any[]
  momentum: any
  synthesis_model: string
}

export default function SynthesisPage() {
  const [synthesis, setSynthesis] = useState<UserSynthesis | null>(null)
  const [uploadCount, setUploadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const [
        { data: synthData },
        { count },
      ] = await Promise.all([
        supabase.from('user_synthesis').select('*').eq('user_id', session.user.id).order('synthesized_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('video_uploads').select('*', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('status', 'processed'),
      ])

      if (synthData) setSynthesis(synthData as UserSynthesis)
      setUploadCount(count || 0)
      setLoading(false)
    }
    load()
  }, [])

  const runSynthesis = async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/synthesize-graph', { method: 'POST' })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Synthesis failed')
      } else {
        // Poll for result — synthesis is async via Inngest
        // Reload page data after a moment
        setTimeout(async () => {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) return
          const { data } = await supabase.from('user_synthesis').select('*').eq('user_id', session.user.id).order('synthesized_at', { ascending: false }).limit(1).maybeSingle()
          if (data) setSynthesis(data as UserSynthesis)
          setRunning(false)
        }, 3000)
      }
    } catch {
      setError('Network error — please try again')
      setRunning(false)
    }
  }

  if (loading) return <div className="p-8 text-[var(--text-tertiary)] font-mono text-xs uppercase tracking-widest animate-pulse">Loading synthesis...</div>

  const MIN_UPLOADS_FOR_SYNTHESIS = 3

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8 pb-32">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-[var(--accent)]" />
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--accent)]">Intelligence</p>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Analysis</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            Cross-corpus analysis across all {uploadCount} processed uploads — narratives, contradictions, momentum.
          </p>
        </div>

        <button
          onClick={runSynthesis}
          disabled={running || uploadCount < MIN_UPLOADS_FOR_SYNTHESIS}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          title={uploadCount < MIN_UPLOADS_FOR_SYNTHESIS ? `Need at least ${MIN_UPLOADS_FOR_SYNTHESIS} processed uploads` : undefined}
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {running ? 'Running synthesis...' : synthesis ? 'Re-synthesize' : 'Run synthesis'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {uploadCount < MIN_UPLOADS_FOR_SYNTHESIS && (
        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] text-center">
          <Sparkles size={28} className="mx-auto mb-3 text-[var(--accent)] opacity-40" />
          <p className="text-sm font-medium text-[var(--text-secondary)]">Not enough data yet</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Upload at least {MIN_UPLOADS_FOR_SYNTHESIS} videos and let them process, then run synthesis.
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Currently: {uploadCount} processed uploads</p>
        </div>
      )}

      {running && (
        <div className="p-8 rounded-xl bg-[var(--bg-secondary)] border border-[var(--accent)]/20 text-center space-y-3">
          <Loader2 size={28} className="animate-spin text-[var(--accent)] mx-auto" />
          <p className="text-sm font-medium text-[var(--text-primary)]">Synthesizing your corpus...</p>
          <p className="text-xs text-[var(--text-tertiary)]">Analyzing {uploadCount} uploads, {' '}building narrative arcs. This takes 30–60 seconds.</p>
        </div>
      )}

      {!running && synthesis && (
        <div className="space-y-8">
          {/* Meta */}
          <div className="flex items-center gap-4 text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
            <span className="flex items-center gap-1"><Clock size={10} /> {new Date(synthesis.synthesized_at).toLocaleString()}</span>
            <span>·</span>
            <span>{synthesis.upload_count} uploads analyzed</span>
            <span>·</span>
            <span>{synthesis.synthesis_model}</span>
          </div>

          {/* Spine */}
          {synthesis.spine && (
            <div className="p-6 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/20">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--accent)] mb-2">Through-line</p>
              <p className="text-lg font-medium text-[var(--text-primary)] leading-relaxed italic">"{synthesis.spine}"</p>
            </div>
          )}

          {/* Narratives */}
          {synthesis.narratives?.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Narratives</h2>
              <div className="space-y-3">
                {synthesis.narratives.map((n: any, i: number) => (
                  <div key={i} className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{n.title}</h3>
                      {n.arc_type && <span className="flex-shrink-0 text-[9px] font-mono uppercase text-[var(--accent)] bg-[var(--accent-soft)] px-2 py-0.5 rounded-full border border-[var(--accent)]/20">{n.arc_type}</span>}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{n.description}</p>
                    {n.strength && (
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${n.strength * 10}%` }} />
                        </div>
                        <span className="text-[9px] font-mono text-[var(--text-tertiary)]">strength {n.strength}/10</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Themes + Momentum side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {synthesis.themes?.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Recurring Themes</h2>
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl overflow-hidden">
                  {synthesis.themes.slice(0, 6).map((t: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-light)]/50 last:border-0">
                      <div className="flex-1">
                        <p className="text-xs font-medium text-[var(--text-primary)]">{t.theme}</p>
                        {(t.first_seen || t.last_seen) && (
                          <p className="text-[10px] font-mono text-[var(--text-tertiary)] mt-0.5">
                            {t.upload_count ? `${t.upload_count} sessions` : ''}
                            {t.first_seen ? ` · since ${new Date(t.first_seen).toLocaleDateString()}` : ''}
                          </p>
                        )}
                      </div>
                      {t.strength && (
                        <div className="w-14 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${t.strength * 10}%` }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {synthesis.momentum && (
              <div className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Momentum</h2>
                <div className="space-y-3">
                  {synthesis.momentum.accelerating?.length > 0 && (
                    <div className="p-4 rounded-xl bg-emerald-400/5 border border-emerald-400/20">
                      <p className="text-[10px] font-mono text-emerald-400 uppercase mb-2 flex items-center gap-1"><TrendingUp size={10} /> Accelerating</p>
                      {synthesis.momentum.accelerating.map((a: string, i: number) => (
                        <p key={i} className="text-xs text-[var(--text-secondary)]">· {a}</p>
                      ))}
                    </div>
                  )}
                  {synthesis.momentum.stalling?.length > 0 && (
                    <div className="p-4 rounded-xl bg-amber-400/5 border border-amber-400/20">
                      <p className="text-[10px] font-mono text-amber-400 uppercase mb-2">Stalling</p>
                      {synthesis.momentum.stalling.map((s: string, i: number) => (
                        <p key={i} className="text-xs text-[var(--text-secondary)]">· {s}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Contradictions */}
          {synthesis.contradictions?.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] flex items-center gap-2"><AlertCircle size={12} className="text-amber-400" /> Contradictions Detected</h2>
              <div className="space-y-3">
                {synthesis.contradictions.map((c: any, i: number) => (
                  <div key={i} className="p-4 rounded-xl bg-amber-400/5 border border-amber-400/20">
                    <p className="text-xs font-semibold text-amber-400 mb-2">{c.topic}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><p className="text-[10px] font-mono text-[var(--text-tertiary)] mb-1">Earlier position</p><p className="text-xs text-[var(--text-secondary)]">{c.position_a}</p></div>
                      <div><p className="text-[10px] font-mono text-[var(--text-tertiary)] mb-1">Later position</p><p className="text-xs text-[var(--text-secondary)]">{c.position_b}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Open commitments */}
          {synthesis.commitments_open?.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Open Commitments</h2>
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl overflow-hidden">
                {synthesis.commitments_open.map((c: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border-light)]/50 last:border-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-[var(--text-primary)]">{typeof c === 'string' ? c : c.commitment}</p>
                      {c.date && <p className="text-[10px] font-mono text-[var(--text-tertiary)] mt-0.5">Committed {new Date(c.date).toLocaleDateString()}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!running && !synthesis && uploadCount >= MIN_UPLOADS_FOR_SYNTHESIS && (
        <div className="p-10 rounded-xl bg-[var(--bg-secondary)] border border-dashed border-[var(--border-light)] text-center">
          <Sparkles size={28} className="mx-auto mb-3 text-[var(--accent)] opacity-40" />
          <p className="text-sm font-medium text-[var(--text-secondary)]">Ready to synthesize</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1 mb-5">{uploadCount} uploads processed and waiting. Run synthesis to find the narratives.</p>
          <button onClick={runSynthesis} className="btn btn-primary btn-sm flex items-center gap-2 mx-auto">
            <Sparkles size={13} /> Run First Synthesis
          </button>
        </div>
      )}
    </div>
  )
}
