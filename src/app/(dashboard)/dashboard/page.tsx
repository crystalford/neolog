'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  Activity, Brain, Zap, Crosshair,
  Database, Radio, Box, ChevronRight, Fingerprint,
  Mic, ImageIcon, Sparkles, AlertCircle, TrendingUp
} from 'lucide-react'
import { ManifestAvatar } from '@/components/dashboard/ManifestAvatar'

export default function LiveMindDashboard() {
  const [recentEntities, setRecentEntities] = useState<any[]>([])
  const [recentUploads, setRecentUploads] = useState<any[]>([])
  const [activeDirectives, setActiveDirectives] = useState<any[]>([])
  const [openQuestions, setOpenQuestions] = useState<any[]>([])
  const [corpusStats, setCorpusStats] = useState({ voice: 0, face: 0, voiceMinutes: 0, qualifiedFaces: 0 })
  const [lastUploadContrib, setLastUploadContrib] = useState<{ voiceSecs: number; frames: number } | null>(null)
  const [synthesis, setSynthesis] = useState<{ spine: string; synthesized_at: string; commitments_open: any[] } | null>(null)
  const [uploadsSinceSynthesis, setUploadsSinceSynthesis] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const [
        { data: entities },
        { data: uploads },
        { data: goals },
        { data: questions },
        { data: corpus },
        { data: synthData },
      ] = await Promise.all([
        supabase.from('entities').select('*').eq('user_id', session.user.id).order('last_mentioned_at', { ascending: false, nullsFirst: false }).limit(5),
        supabase.from('video_uploads').select('id, file_name, created_at, status, analysis, duration_seconds').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('entities').select('*').eq('user_id', session.user.id).eq('type', 'goal').order('mention_count', { ascending: false }).limit(4),
        supabase.from('entities').select('id, name').eq('user_id', session.user.id).eq('type', 'question').order('last_mentioned_at', { ascending: false, nullsFirst: false }).limit(4),
        supabase.from('neural_corpus').select('type, fidelity_score, meta, source_upload_id, created_at').eq('user_id', session.user.id),
        supabase.from('user_synthesis').select('spine, synthesized_at, commitments_open').eq('user_id', session.user.id).order('synthesized_at', { ascending: false }).limit(1).maybeSingle(),
      ])

      setRecentEntities(entities || [])
      setRecentUploads(uploads || [])
      setOpenQuestions(questions || [])
      setActiveDirectives(goals?.map(g => ({
        id: g.id,
        title: g.name,
        progress: Math.min(100, (g.mention_count || 0) * 5),
        priority: g.metadata?.priority || 'NORMAL',
      })) || [])

      if (corpus) {
        const voiceEntries = corpus.filter((c: any) => c.type === 'voice')
        const faceEntries = corpus.filter((c: any) => c.type === 'face')
        const voiceMinutes = voiceEntries.reduce((acc: number, v: any) => {
          const secs = v.meta?.duration_seconds
          return acc + (typeof secs === 'number' ? secs / 60 : 5)
        }, 0)
        const qualifiedFaces = faceEntries.filter((f: any) => (f.fidelity_score ?? 0.7) >= 0.6).length
        setCorpusStats({ voice: voiceEntries.length, face: faceEntries.length, voiceMinutes: Math.round(voiceMinutes), qualifiedFaces })

        // Last upload contribution — corpus entries from most recent upload
        if (uploads && uploads.length > 0) {
          const latestUploadId = uploads[0].id
          const latestVoice = corpus.filter((c: any) => c.type === 'voice' && c.source_upload_id === latestUploadId)
          const latestFaces = corpus.filter((c: any) => c.type === 'face' && c.source_upload_id === latestUploadId)
          const voiceSecs = latestVoice.reduce((acc: number, v: any) => {
            const s = v.meta?.duration_seconds
            return acc + (typeof s === 'number' ? s : 0)
          }, 0)
          if (latestVoice.length > 0 || latestFaces.length > 0) {
            setLastUploadContrib({ voiceSecs: Math.round(voiceSecs), frames: latestFaces.length })
          }
        }
      }

      if (synthData) {
        setSynthesis(synthData as any)
        // Count uploads since last synthesis
        if (synthData.synthesized_at && uploads) {
          const sinceCount = uploads.filter(u => new Date(u.created_at) > new Date(synthData.synthesized_at)).length
          setUploadsSinceSynthesis(sinceCount)
        }
      } else if (uploads) {
        setUploadsSinceSynthesis(uploads.length)
      }

      setLoading(false)
    }

    loadData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20 font-mono text-xs text-[var(--text-tertiary)] uppercase tracking-[0.3em] animate-pulse">
        <Fingerprint size={24} className="mr-3 opacity-50" />
        Initializing Neural Telemetry...
      </div>
    )
  }

  const voicePct = Math.min(100, Math.round((corpusStats.voiceMinutes / 180) * 100))
  const facePct = Math.min(100, Math.round((corpusStats.qualifiedFaces / 25) * 100))

  return (
    <div className="min-h-full bg-[var(--bg-primary)] text-[var(--text-primary)] p-4 md:p-8 font-sans">
      <style dangerouslySetInnerHTML={{__html: `
        .hud-panel {
          background: rgba(10, 10, 12, 0.4);
          border: 1px solid rgba(124, 106, 245, 0.15);
          box-shadow: inset 0 0 20px rgba(124, 106, 245, 0.02);
          position: relative;
        }
        .hud-panel::before {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 6px; height: 6px;
          border-top: 1px solid var(--accent);
          border-left: 1px solid var(--accent);
        }
        .hud-panel::after {
          content: '';
          position: absolute;
          bottom: 0; right: 0; width: 6px; height: 6px;
          border-bottom: 1px solid var(--accent);
          border-right: 1px solid var(--accent);
        }
        .hud-header {
          border-bottom: 1px solid rgba(255,255,255,0.05);
          background: linear-gradient(90deg, rgba(124, 106, 245, 0.1) 0%, transparent 100%);
        }
        .scan-line {
          position: absolute;
          top: 0; left: 0; right: 0; height: 2px;
          background: var(--accent);
          opacity: 0.07;
          animation: scan 5s linear infinite;
        }
        @keyframes scan {
          0% { transform: translateY(0); }
          100% { transform: translateY(1200px); }
        }
      `}} />

      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="scan-line" />
      </div>

      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row gap-4 items-end justify-between border-b border-[var(--border-light)] pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity size={14} className="text-[var(--accent)]" />
              <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[var(--accent)]">Control Room</h2>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Neural Telemetry</h1>
          </div>
          <div className="flex items-center gap-6 font-mono text-xs text-[var(--text-tertiary)]">
            <div className="text-right">
              <p className="uppercase text-[9px] mb-0.5">Corpus</p>
              <p className="text-[var(--text-secondary)]">{corpusStats.voice}v / {corpusStats.face}f signals</p>
            </div>
            <div className="text-right">
              <p className="uppercase text-[9px] mb-0.5">Entities</p>
              <p className="text-[var(--text-secondary)]">{recentEntities.length > 0 ? 'active' : 'empty'}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── LEFT: Manifest + Corpus ── */}
          <div className="lg:col-span-4 flex flex-col gap-5">

            {/* ManifestAvatar — links to full manifest page */}
            <Link href="/dashboard/manifest" className="block hover:opacity-90 transition-opacity">
              <ManifestAvatar />
            </Link>

            {/* Manifest Thresholds — real data */}
            <div className="hud-panel p-5 rounded-sm">
              <div className="hud-header -mx-5 -mt-5 px-5 py-3 mb-5 flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold uppercase tracking-widest flex items-center gap-2 text-[var(--text-secondary)]">
                  <Fingerprint size={13} className="text-emerald-400" /> Manifest Progress
                </span>
                <Link href="/dashboard/manifest" className="text-[9px] font-mono text-[var(--accent)] hover:underline">Details →</Link>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-[10px] font-mono uppercase mb-1.5 text-[var(--text-tertiary)]">
                    <span className="flex items-center gap-1"><Mic size={10} className="text-emerald-400" /> Voice</span>
                    <span className="text-[var(--text-primary)]">{corpusStats.voiceMinutes}m / 180m</span>
                  </div>
                  <div className="h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${voicePct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-mono uppercase mb-1.5 text-[var(--text-tertiary)]">
                    <span className="flex items-center gap-1"><ImageIcon size={10} className="text-indigo-400" /> Visual</span>
                    <span className="text-[var(--text-primary)]">{corpusStats.qualifiedFaces} / 25 frames</span>
                  </div>
                  <div className="h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${facePct}%` }} />
                  </div>
                </div>
                {lastUploadContrib && (
                  <div className="mt-1 p-2.5 rounded bg-[var(--bg-tertiary)]/40 border border-[var(--border-light)]">
                    <p className="text-[9px] font-mono uppercase text-[var(--text-tertiary)] mb-1">Last upload contributed</p>
                    <p className="text-[10px] font-mono text-[var(--text-secondary)]">
                      {lastUploadContrib.voiceSecs > 0 ? `${lastUploadContrib.voiceSecs}s voice` : ''}
                      {lastUploadContrib.voiceSecs > 0 && lastUploadContrib.frames > 0 ? ' · ' : ''}
                      {lastUploadContrib.frames > 0 ? `${lastUploadContrib.frames} face frames` : ''}
                    </p>
                  </div>
                )}
                <p className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-50 uppercase italic leading-tight">
                  Signals harvested automatically from every upload.
                </p>
              </div>
            </div>

            {/* Open Questions from entity graph */}
            {openQuestions.length > 0 && (
              <div className="hud-panel p-5 rounded-sm">
                <div className="hud-header -mx-5 -mt-5 px-5 py-3 mb-4 flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-widest flex items-center gap-2 text-[var(--text-secondary)]">
                    <Brain size={13} className="text-purple-400" /> Open Questions
                  </span>
                </div>
                <div className="space-y-2">
                  {openQuestions.map(q => (
                    <div key={q.id} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                      <span className="text-purple-400 mt-0.5 flex-shrink-0">?</span>
                      <span className="leading-relaxed">{q.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: Intelligence Pulse ── */}
          <div className="lg:col-span-8 flex flex-col gap-5">

            {/* Synthesis — spine + CTA */}
            <div className="hud-panel p-5 rounded-sm">
              <div className="hud-header -mx-5 -mt-5 px-5 py-3 mb-5 flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold uppercase tracking-widest flex items-center gap-2 text-[var(--text-secondary)]">
                  <Sparkles size={13} className="text-[var(--accent)]" /> Synthesis
                </span>
                <Link href="/dashboard/synthesis" className="text-[10px] font-mono text-[var(--accent)] hover:underline flex items-center gap-1">
                  View All <ChevronRight size={10} />
                </Link>
              </div>

              {synthesis?.spine ? (
                <div className="space-y-4">
                  <p className="text-sm text-[var(--text-primary)] leading-relaxed italic border-l-2 border-[var(--accent)]/50 pl-3">
                    "{synthesis.spine}"
                  </p>
                  {synthesis.commitments_open && synthesis.commitments_open.length > 0 && (
                    <div>
                      <p className="text-[10px] font-mono uppercase text-[var(--text-tertiary)] mb-2">Open Commitments</p>
                      <div className="space-y-1.5">
                        {synthesis.commitments_open.slice(0, 3).map((c: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                            <span className="text-amber-400 mt-0.5 flex-shrink-0">·</span>
                            <span>{typeof c === 'string' ? c : c.commitment}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {uploadsSinceSynthesis >= 10 && (
                    <Link href="/dashboard/synthesis" className="flex items-center gap-2 text-xs text-[var(--accent)] hover:underline">
                      <AlertCircle size={12} /> {uploadsSinceSynthesis} new uploads since last synthesis — re-run?
                    </Link>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between py-2">
                  <p className="text-xs text-[var(--text-tertiary)]">No synthesis yet. Run your first cross-corpus analysis.</p>
                  <Link href="/dashboard/synthesis" className="flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline">
                    <Sparkles size={12} /> Run Synthesis
                  </Link>
                </div>
              )}
            </div>

            {/* Active Directives */}
            <div className="hud-panel p-5 rounded-sm">
              <div className="hud-header -mx-5 -mt-5 px-5 py-3 mb-5 flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold uppercase tracking-widest flex items-center gap-2 text-[var(--text-secondary)]">
                  <Crosshair size={13} className="text-rose-400" /> Active Directives
                </span>
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">[ {activeDirectives.length} ]</span>
              </div>
              <div className="space-y-3">
                {activeDirectives.length > 0 ? (
                  activeDirectives.map((d, i) => (
                    <div key={d.id} className="group p-3 bg-[var(--bg-tertiary)]/30 border border-[var(--border-light)] hover:border-[var(--accent)]/50 transition-colors rounded-sm">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 bg-[var(--bg-primary)] border border-[var(--border-medium)] text-[var(--text-tertiary)]">FWD-{i+1}</span>
                          <span className="text-xs font-semibold">{d.title}</span>
                        </div>
                        <span className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded-sm ${d.priority === 'CRITICAL' ? 'bg-rose-500/10 text-rose-500' : d.priority === 'HIGH' ? 'bg-amber-500/10 text-amber-500' : 'bg-[var(--border-medium)] text-[var(--text-tertiary)]'}`}>{d.priority}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--text-secondary)] group-hover:bg-[var(--accent)] transition-all" style={{ width: `${d.progress}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{d.progress}%</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] font-mono text-[var(--text-tertiary)] italic">No directives. Entities typed as 'goal' will appear here.</p>
                )}
              </div>
            </div>

            {/* Neural Momentum + Recent Transmissions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

              <div className="hud-panel p-5 rounded-sm">
                <div className="hud-header -mx-5 -mt-5 px-5 py-3 mb-4 flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-widest flex items-center gap-2 text-[var(--text-secondary)]">
                    <Radio size={13} className="text-[var(--accent)]" /> Neural Momentum
                  </span>
                  <Link href="/dashboard/entities" className="text-[9px] font-mono text-[var(--accent)] hover:underline">Brain →</Link>
                </div>
                <div className="space-y-3">
                  {recentEntities.length > 0 ? (
                    recentEntities.slice(0, 4).map(entity => (
                      <div key={entity.id} className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-sm bg-[var(--bg-primary)] border border-[var(--border-medium)] flex items-center justify-center flex-shrink-0">
                          {entity.type === 'project' ? <Box size={12} className="text-blue-400" /> :
                           entity.type === 'idea' ? <Zap size={12} className="text-amber-400" /> :
                           <TrendingUp size={12} className="text-emerald-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate text-[var(--text-secondary)]">{entity.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="flex-1 h-0.5 bg-[var(--border-medium)] overflow-hidden">
                              <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.min((entity.mention_count || 1) * 10, 100)}%` }} />
                            </div>
                            <span className="text-[9px] font-mono text-[var(--text-tertiary)]">{entity.mention_count}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] font-mono text-[var(--text-tertiary)] italic">Awaiting signal ingestion...</p>
                  )}
                </div>
              </div>

              <div className="hud-panel p-5 rounded-sm">
                <div className="hud-header -mx-5 -mt-5 px-5 py-3 mb-4 flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-widest flex items-center gap-2 text-[var(--text-secondary)]">
                    <Database size={13} className="text-emerald-400" /> Recent Transmissions
                  </span>
                  <Link href="/dashboard/uploads" className="text-[9px] font-mono text-[var(--accent)] hover:underline">All →</Link>
                </div>
                <div className="space-y-2">
                  {recentUploads.length > 0 ? (
                    recentUploads.slice(0, 4).map(upload => (
                      <Link key={upload.id} href={`/dashboard/uploads?id=${upload.id}`} className="flex items-center justify-between p-2 hover:bg-[var(--bg-tertiary)]/50 border border-transparent hover:border-[var(--border-light)] rounded-sm group transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate group-hover:text-[var(--accent)] transition-colors">
                            {upload.analysis?.summary?.slice(0, 45) || upload.file_name?.replace(/\.[^.]+$/, '') || 'Transmission'}
                            {(upload.analysis?.summary?.length > 45) ? '…' : ''}
                          </p>
                          <p className="text-[9px] font-mono text-[var(--text-tertiary)]">{new Date(upload.created_at).toLocaleDateString()}</p>
                        </div>
                        <span className={`ml-2 flex-shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded-sm uppercase ${upload.status === 'processed' ? 'bg-emerald-500/10 text-emerald-500' : upload.status === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-500'}`}>
                          {upload.status}
                        </span>
                      </Link>
                    ))
                  ) : (
                    <p className="text-[10px] font-mono text-[var(--text-tertiary)]">No uploads yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
