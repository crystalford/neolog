'use client'

import { useState, useEffect } from 'react'
import { Brain, Signal, Activity, HelpCircle, Zap, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function ManifestAvatar() {
  const [signalCount, setSignalCount] = useState(0)
  const [readyCount, setReadyCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchSignalStats() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { data, error } = await supabase
          .from('neural_signals')
          .select('id, is_training_ready')
          .eq('user_id', session.user.id)

        if (data) {
          setSignalCount(data.length)
          setReadyCount(data.filter(s => s.is_training_ready).length)
        }
      } catch (err) {
        console.error('Failed to fetch neural stats:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchSignalStats()
    
    // Polling for refinement updates
    const interval = setInterval(fetchSignalStats, 10000)
    return () => clearInterval(interval)
  }, [])

  const trainingProgress = Math.min(100, (readyCount / 15) * 100)
  const isReady = readyCount >= 15

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
               <Signal size={10} className="text-cyan-400" /> Signal Density
             </div>
             <div className="text-sm font-bold">{readyCount} <span className="text-[10px] text-white/40 font-normal">/ 15</span></div>
           </div>
           <div className="space-y-1 text-right">
             <div className="flex items-center justify-end gap-1.5 text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-tight">
               <Activity size={10} className="text-amber-400" /> Integrity
             </div>
             <div className="text-sm font-bold text-emerald-400">92%</div>
           </div>
        </div>

        {/* Training Bar */}
        <div className="w-full space-y-2">
           <div className="flex justify-between items-center text-[9px] font-mono font-bold uppercase tracking-widest">
              <span className="text-cyan-400">Neural Sync</span>
              <span className="text-white/60">{Math.round(trainingProgress)}%</span>
           </div>
           <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-[1px]">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ${
                  isReady ? 'bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_10px_var(--accent)]' : 'bg-cyan-400/40'
                }`}
                style={{ width: `${trainingProgress}%` }}
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
