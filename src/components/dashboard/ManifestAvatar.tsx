'use client'

import { useState, useEffect } from 'react'
import { Brain, Signal, Activity, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function ManifestAvatar() {
  const [faceCount, setFaceCount] = useState(0)
  const [voiceMinutes, setVoiceMinutes] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchCorpusStats() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { data } = await supabase
          .from('neural_corpus')
          .select('type, fidelity_score, meta')
          .eq('user_id', session.user.id)

        if (data) {
          const faces = data.filter(r => r.type === 'face')
          const voices = data.filter(r => r.type === 'voice')
          setFaceCount(faces.length)
          const totalSeconds = voices.reduce((sum, r) => sum + ((r.meta as any)?.duration_seconds || 0), 0)
          setVoiceMinutes(Math.round(totalSeconds / 60))
        }
      } catch (err) {
        console.error('Failed to fetch corpus stats:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchCorpusStats()
    const interval = setInterval(fetchCorpusStats, 10000)
    return () => clearInterval(interval)
  }, [])

  const faceProgress = Math.min(100, (faceCount / 25) * 100)
  const voiceProgress = Math.min(100, (voiceMinutes / 180) * 100)
  const isReady = faceCount >= 25 && voiceMinutes >= 180

  return (
    <div className="relative group">
      {/* Outer Glow Ring */}
      <div className={`absolute -inset-4 rounded-full blur-2xl transition-all duration-1000 opacity-20 ${
        isReady ? 'bg-cyan-500 animate-pulse' : 'bg-amber-500/30'
      }`}></div>

      <div className="relative flex flex-col items-center gap-6 p-8 bg-black/40 border border-white/5 rounded-[3rem] backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Signal Lines (SVG decoration) */}
        <svg className="absolute inset-0 w-full h-full opacity-10 pointer-events-none" viewBox="0 0 200 200">
           <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-cyan-500" strokeDasharray="4 4" />
           <circle cx="100" cy="100" r="60" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-cyan-500" strokeDasharray="2 2" />
        </svg>

        {/* Avatar Core */}
        <div className="relative">
          <div className={`w-36 h-36 rounded-full border-2 flex items-center justify-center transition-all duration-700 ${
            isReady
            ? 'border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.3)] bg-cyan-950/20'
            : 'border-white/10 bg-white/5 grayscale'
          }`}>
            {loading ? (
              <Loader2 className="w-12 h-12 text-cyan-500 animate-spin" />
            ) : isReady ? (
              <div className="relative w-full h-full flex items-center justify-center">
                 <Brain className="w-16 h-16 text-cyan-400" />
                 <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-500/20 to-transparent"></div>
              </div>
            ) : (
              <Brain className="w-16 h-16 text-white/20" />
            )}
          </div>

          {/* Manifestation Badge */}
          <div className={`absolute -bottom-2 right-2 px-3 py-1 rounded-full border text-[9px] font-mono font-bold uppercase tracking-widest ${
            isReady ? 'bg-cyan-500 border-cyan-400 text-white shadow-lg' : 'bg-black/60 border-white/10 text-white/40'
          }`}>
             {isReady ? 'Manifest Active' : 'Forming...'}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="w-full grid grid-cols-2 gap-4">
           <div className="space-y-1">
             <div className="flex items-center gap-1.5 text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-tight">
               <Signal size={10} className="text-cyan-400" /> Face Frames
             </div>
             <div className="text-sm font-bold">{faceCount} <span className="text-[10px] text-white/40 font-normal">/ 25</span></div>
           </div>
           <div className="space-y-1 text-right">
             <div className="flex items-center justify-end gap-1.5 text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-tight">
               <Activity size={10} className="text-amber-400" /> Voice
             </div>
             <div className="text-sm font-bold">{voiceMinutes}m <span className="text-[10px] text-white/40 font-normal">/ 180m</span></div>
           </div>
        </div>

        {/* Face Frame Training Bar */}
        <div className="w-full space-y-2">
           <div className="flex justify-between items-center text-[9px] font-mono font-bold uppercase tracking-widest">
              <span className="text-cyan-400">Visual Corpus</span>
              <span className="text-white/60">{Math.round(faceProgress)}%</span>
           </div>
           <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-[1px]">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${
                  faceCount >= 25 ? 'bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_10px_var(--accent)]' : 'bg-cyan-400/40'
                }`}
                style={{ width: `${faceProgress}%` }}
              />
           </div>
        </div>

        {/* Voice Training Bar */}
        <div className="w-full space-y-2">
           <div className="flex justify-between items-center text-[9px] font-mono font-bold uppercase tracking-widest">
              <span className="text-amber-400">Voice Corpus</span>
              <span className="text-white/60">{Math.round(voiceProgress)}%</span>
           </div>
           <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-[1px]">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${
                  voiceMinutes >= 180 ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-amber-400/40'
                }`}
                style={{ width: `${voiceProgress}%` }}
              />
           </div>
        </div>

        <div className="pt-2 text-center">
          <p className="text-[10px] text-[var(--text-tertiary)] max-w-[180px] leading-relaxed italic">
            "{isReady ? 'The manifest has achieved cognitive stability. Initiate voice sync.' : 'Continue ingesting high-fidelity signals to stabilize your virtual manifest.'}"
          </p>
        </div>
      </div>
    </div>
  )
}
