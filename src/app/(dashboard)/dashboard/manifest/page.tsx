'use client'export const runtime = 'edge'


import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Cpu, Mic, ImageIcon, Brain, CheckCircle, Clock, AlertCircle, Zap, TrendingUp, Shield } from 'lucide-react'

interface CorpusStats {
  voice: number
  face: number
  voiceMinutes: number
  qualifiedFaces: number
}

interface RecentSignal {
  id: string
  type: string
  fidelity_score: number
  fidelity_rank: string
  created_at: string
  meta: any
  source_upload_id: string
}

interface ManifestModel {
  signal_type: string
  is_training_ready: boolean
  quality_score: number
  metadata: any
  created_at: string
}

export default function ManifestPage() {
  const [loading, setLoading] = useState(true)
  const [corpus, setCorpus] = useState<CorpusStats>({ voice: 0, face: 0, voiceMinutes: 0, qualifiedFaces: 0 })
  const [recentSignals, setRecentSignals] = useState<RecentSignal[]>([])
  const [models, setModels] = useState<ManifestModel[]>([])
  const [faceThumbnails, setFaceThumbnails] = useState<string[]>([])

  const supabase = createClient()

  const VOICE_THRESHOLD_MINUTES = 180
  const FACE_THRESHOLD = 25

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const [
        { data: corpusData },
        { data: signalsData },
      ] = await Promise.all([
        supabase.from('neural_corpus').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }),
        supabase.from('neural_signals').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(5),
      ])

      if (corpusData) {
        const voiceEntries = corpusData.filter((c: any) => c.type === 'voice')
        const faceEntries = corpusData.filter((c: any) => c.type === 'face')

        // Real duration from meta.duration_seconds if available, else estimate 5min per entry
        const voiceMinutes = voiceEntries.reduce((acc: number, v: any) => {
          const secs = v.meta?.duration_seconds
          return acc + (typeof secs === 'number' ? secs / 60 : 5)
        }, 0)

        // Qualified faces: fidelity_score >= 0.6 (or all if score not yet calibrated)
        const qualifiedFaces = faceEntries.filter((f: any) => (f.fidelity_score ?? 0.7) >= 0.6).length

        setCorpus({
          voice: voiceEntries.length,
          face: faceEntries.length,
          voiceMinutes: Math.round(voiceMinutes),
          qualifiedFaces,
        })

        // Face thumbnails — top 6 by fidelity
        const topFaces = faceEntries
          .sort((a: any, b: any) => (b.fidelity_score || 0) - (a.fidelity_score || 0))
          .slice(0, 6)
          .map((f: any) => f.storage_path)
          .filter(Boolean)
        setFaceThumbnails(topFaces)

        setRecentSignals(corpusData.slice(0, 12) as RecentSignal[])
      }

      if (signalsData) setModels(signalsData as ManifestModel[])

      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="p-8 text-[var(--text-tertiary)] font-mono text-xs uppercase tracking-widest animate-pulse">Loading neural manifest...</div>

  const voicePct = Math.min(100, Math.round((corpus.voiceMinutes / VOICE_THRESHOLD_MINUTES) * 100))
  const facePct = Math.min(100, Math.round((corpus.qualifiedFaces / FACE_THRESHOLD) * 100))

  const voiceModel = models.find(m => m.signal_type === 'voice')
  const imageModel = models.find(m => m.signal_type === 'image')

  const voiceReady = corpus.voiceMinutes >= VOICE_THRESHOLD_MINUTES
  const faceReady = corpus.qualifiedFaces >= FACE_THRESHOLD

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-10 pb-32">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Cpu size={18} className="text-[var(--accent)]" />
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--accent)]">AI Model</p>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Training Pipeline</h1>
        <p className="text-sm text-[var(--text-tertiary)] mt-2 max-w-2xl">
          Every upload you make passively builds your AI twin. Voice samples, face frames, and entity intelligence accumulate automatically — you never need to do anything extra.
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            icon: Mic,
            color: 'text-emerald-400',
            bg: 'bg-emerald-400/10 border-emerald-400/20',
            title: 'Voice Corpus',
            desc: 'Every audio/video upload contributes clean voice audio for ElevenLabs Professional Voice Clone training.',
            target: 'Target: 180 min of clean audio',
          },
          {
            icon: ImageIcon,
            color: 'text-indigo-400',
            bg: 'bg-indigo-400/10 border-indigo-400/20',
            title: 'Visual Corpus',
            desc: 'Face frames are extracted at 5 points per video and scored for clarity — building your FLUX LoRA visual model.',
            target: 'Target: 25 qualified frames',
          },
          {
            icon: Brain,
            color: 'text-[var(--accent)]',
            bg: 'bg-[var(--accent-soft)] border-[var(--accent)]/20',
            title: 'Intelligence Graph',
            desc: 'Projects, people, goals, ideas, and patterns accumulate across every session into your entity knowledge graph.',
            target: 'Grows with every upload',
          },
        ].map(item => {
          const Icon = item.icon
          return (
            <div key={item.title} className={`p-5 rounded-xl border ${item.bg}`}>
              <div className="flex items-center gap-2 mb-3">
                <Icon size={16} className={item.color} />
                <h3 className={`text-xs font-bold uppercase tracking-wider ${item.color}`}>{item.title}</h3>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">{item.desc}</p>
              <p className={`text-[10px] font-mono ${item.color} opacity-70`}>{item.target}</p>
            </div>
          )
        })}
      </div>

      {/* Empty state hint — shown when no corpus data yet */}
      {corpus.voice === 0 && corpus.face === 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-400/5 border border-amber-400/20 text-xs text-amber-300/80">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-amber-400" />
          <div>
            <p className="font-medium mb-0.5">No corpus data yet</p>
            <p className="text-amber-300/60 leading-relaxed">
              Upload a video to start building. Voice and face data are extracted automatically during processing and accumulate here over time.
            </p>
          </div>
        </div>
      )}

      {/* Corpus Health */}
      <div className="space-y-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Corpus Health</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Voice */}
          <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Mic size={15} className="text-emerald-400" />
                <span className="text-sm font-semibold">Voice Archive</span>
              </div>
              {voiceReady ? (
                <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full border border-emerald-400/20"><CheckCircle size={10} /> Threshold met</span>
              ) : (
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{corpus.voiceMinutes}m / {VOICE_THRESHOLD_MINUTES}m</span>
              )}
            </div>
            <div className="h-2 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden mb-3">
              <div className="h-full bg-emerald-400 rounded-full transition-all duration-700" style={{ width: `${voicePct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-[var(--text-tertiary)]">
              <span>{corpus.voice} recordings archived</span>
              <span>{voicePct}% of target</span>
            </div>

            {/* Training status */}
            <div className="mt-4 pt-4 border-t border-[var(--border-light)]">
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-2">ElevenLabs PVC Status</p>
              {voiceModel?.is_training_ready ? (
                <div className="flex items-center gap-2 text-emerald-400 text-xs"><CheckCircle size={13} /> Voice clone ready — model active</div>
              ) : voiceReady ? (
                <div className="flex items-center gap-2 text-amber-400 text-xs"><Clock size={13} /> Threshold met — training will trigger on next upload</div>
              ) : (
                <div className="flex items-center gap-2 text-[var(--text-tertiary)] text-xs"><AlertCircle size={13} /> Accumulating voice samples ({VOICE_THRESHOLD_MINUTES - corpus.voiceMinutes}m remaining)</div>
              )}
            </div>
          </div>

          {/* Visual */}
          <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ImageIcon size={15} className="text-indigo-400" />
                <span className="text-sm font-semibold">Visual Corpus</span>
              </div>
              {faceReady ? (
                <span className="flex items-center gap-1 text-[10px] font-mono text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded-full border border-indigo-400/20"><CheckCircle size={10} /> Threshold met</span>
              ) : (
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{corpus.qualifiedFaces} / {FACE_THRESHOLD} frames</span>
              )}
            </div>
            <div className="h-2 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden mb-3">
              <div className="h-full bg-indigo-400 rounded-full transition-all duration-700" style={{ width: `${facePct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-[var(--text-tertiary)]">
              <span>{corpus.face} total frames extracted</span>
              <span>{facePct}% of target</span>
            </div>

            {/* Face thumbnails */}
            {faceThumbnails.length > 0 && (
              <div className="mt-3 flex gap-2 flex-wrap">
                {faceThumbnails.map((path, i) => (
                  <div key={i} className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--bg-tertiary)] border border-[var(--border-light)]">
                    <img
                      src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${path}`}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Training status */}
            <div className="mt-4 pt-4 border-t border-[var(--border-light)]">
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-2">FLUX LoRA Status</p>
              {imageModel?.is_training_ready ? (
                <div className="flex items-center gap-2 text-emerald-400 text-xs"><CheckCircle size={13} /> LoRA model ready — visual identity locked</div>
              ) : faceReady ? (
                <div className="flex items-center gap-2 text-amber-400 text-xs"><Clock size={13} /> Threshold met — training will trigger on next upload</div>
              ) : (
                <div className="flex items-center gap-2 text-[var(--text-tertiary)] text-xs"><AlertCircle size={13} /> Accumulating face frames ({FACE_THRESHOLD - corpus.qualifiedFaces} remaining)</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Signal Log */}
      <div className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Recent Signals</h2>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl overflow-hidden">
          {recentSignals.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--text-tertiary)]">No signals yet — upload your first video to start building the corpus.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-light)]">
                  {['Type', 'Fidelity', 'Rank', 'Date'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentSignals.map(sig => (
                  <tr key={sig.id} className="border-b border-[var(--border-light)]/50 hover:bg-[var(--bg-tertiary)]/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {sig.type === 'voice' ? <Mic size={12} className="text-emerald-400" /> : <ImageIcon size={12} className="text-indigo-400" />}
                        <span className="font-mono text-[var(--text-secondary)]">{sig.type}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${(sig.fidelity_score || 0) >= 0.8 ? 'bg-emerald-400' : (sig.fidelity_score || 0) >= 0.6 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${Math.round((sig.fidelity_score || 0.7) * 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-[var(--text-tertiary)]">{Math.round((sig.fidelity_score || 0.7) * 100)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-mono text-xs ${
                        (sig.fidelity_rank || 'B') === 'S' ? 'text-amber-400' :
                        (sig.fidelity_rank || 'B') === 'A' ? 'text-emerald-400' :
                        (sig.fidelity_rank || 'B') === 'B' ? 'text-blue-400' : 'text-[var(--text-tertiary)]'
                      }`}>{sig.fidelity_rank || 'B'}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--text-tertiary)]">
                      {new Date(sig.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* What gets unlocked */}
      <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-5 flex items-center gap-2"><Zap size={13} className="text-[var(--accent)]" /> What You Unlock</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: Mic, title: 'Voice Clone', desc: 'A 1:1 ElevenLabs voice duplicate with deep emotional range. Generate audio in your voice.', ready: voiceReady },
            { icon: ImageIcon, title: 'Visual LoRA', desc: 'A FLUX LoRA that generates you in any scenario — any setting, any style, any era.', ready: faceReady },
            { icon: Shield, title: 'Cinematic Avatar', desc: 'Combine LoRA + LivePortrait to remap your real video onto the AI-generated avatar at cinema quality.', ready: voiceReady && faceReady },
          ].map(item => {
            const Icon = item.icon
            return (
              <div key={item.title} className={`p-4 rounded-xl border transition-all ${item.ready ? 'border-[var(--accent)]/30 bg-[var(--accent-soft)]' : 'border-[var(--border-light)] bg-[var(--bg-tertiary)]/20 opacity-60'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {item.ready ? <CheckCircle size={13} className="text-[var(--accent)]" /> : <TrendingUp size={13} className="text-[var(--text-tertiary)]" />}
                  <Icon size={13} className={item.ready ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'} />
                  <span className={`text-xs font-bold ${item.ready ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'}`}>{item.title}</span>
                </div>
                <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">{item.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
