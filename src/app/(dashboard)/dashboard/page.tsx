'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { 
  Activity, Brain, Zap, Battery, Crosshair, 
  Layers, Database, Compass, Radio, 
  Map as MapIcon, Box, ChevronRight, Fingerprint
} from 'lucide-react'
import { ManifestAvatar } from '@/components/dashboard/ManifestAvatar'

// Data-driven HUD

export default function LiveMindDashboard() {
  const [recentEntities, setRecentEntities] = useState<any[]>([])
  const [recentTransmissions, setRecentTransmissions] = useState<any[]>([])
  const [activeDirectives, setActiveDirectives] = useState<any[]>([])
  const [cognitiveState, setCognitiveState] = useState({ focus: 50, energy: 50, stress: 20, clarity: 50 })
  const [insights, setInsights] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Parallel fetch for speed
      const [
        { data: entities },
        { data: uploads },
        { data: goals },
        { data: recentLogs }
      ] = await Promise.all([
        supabase.from('entities').select('*').eq('user_id', session.user.id).order('last_mentioned_at', { ascending: false, nullsFirst: false }).limit(4),
        supabase.from('video_uploads').select('id, title, created_at, status').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(3),
        supabase.from('entities').select('*').eq('user_id', session.user.id).eq('type', 'goal').order('mention_count', { ascending: false }).limit(3),
        supabase.from('log_entries').select('meta').eq('user_id', session.user.id).order('logged_at', { ascending: false }).limit(10)
      ])

      setRecentEntities(entities || [])
      setRecentTransmissions(uploads || [])
      
      // Process Goals into Directives
      setActiveDirectives(goals?.map(g => ({
        id: g.id,
        title: g.name,
        progress: Math.min(100, (g.mention_count || 0) * 5), // Heuristic progress
        priority: g.metadata?.priority || 'NORMAL'
      })) || [])

      // Process Cognitive State from last 10 logs
      if (recentLogs && recentLogs.length > 0) {
        let f = 0, e = 0, s = 0, c = 0, count = 0
        const extractedInsights: any[] = []

        recentLogs.forEach(log => {
          const m = log.meta as any
          if (m?.analysis) {
            f += m.analysis.focus_score || 50
            e += m.analysis.energy_score || 50
            s += m.analysis.stress_score || 20
            c += m.analysis.clarity_score || 50
            count++
          }
          if (m?.insights) {
            extractedInsights.push(...m.insights)
          }
        })

        if (count > 0) {
          setCognitiveState({ 
            focus: Math.round(f / count), 
            energy: Math.round(e / count), 
            stress: Math.round(s / count), 
            clarity: Math.round(c / count) 
          })
        }
        setInsights(extractedInsights.slice(0, 3).map((text, id) => ({ id, text, type: 'SIGNAL' })))
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

  return (
    <div className="min-h-full bg-[var(--bg-primary)] text-[var(--text-primary)] p-4 md:p-8 font-sans selection:bg-[var(--accent)] selection:text-white">
      
      {/* 
        HUD AESTHETIC STYLING
        Deus Ex / Cyberpunk vibes: Monospace accents, structural grid borders, glowing elements, dense telemetry.
      */}
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
          opacity: 0.1;
          animation: scan 4s linear infinite;
        }
        @keyframes scan {
          0% { transform: translateY(0); }
          100% { transform: translateY(1000px); }
        }
        .glitch-hover:hover {
          text-shadow: 2px 0 var(--accent), -2px 0 #06B6D4;
        }
      `}} />

      {/* Background Scanline */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
         <div className="scan-line" />
      </div>

      <div className="max-w-7xl mx-auto space-y-6">

        {/* TOP ROW: Identity & Global Status */}
        <div className="flex flex-col md:flex-row gap-6 items-end justify-between border-b border-[var(--border-light)] pb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Activity size={16} className="text-[var(--accent)]" />
              <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[var(--accent)]">System Diagnostics [Online]</h2>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] glitch-hover">NEURAL TELEMETRY</h1>
          </div>
          <div className="flex items-center gap-6 font-mono text-xs">
             <div className="flex flex-col items-end">
               <span className="text-[var(--text-tertiary)] uppercase text-[9px]">Uptime</span>
               <span className="text-[var(--text-secondary)]">ACTIVE</span>
             </div>
             <div className="flex flex-col items-end">
               <span className="text-[var(--text-tertiary)] uppercase text-[9px]">Sync Status</span>
               <span className="text-emerald-400">99.9%</span>
             </div>
             <div className="flex flex-col items-end">
               <span className="text-[var(--text-tertiary)] uppercase text-[9px]">Threat Level</span>
               <span className="text-[var(--text-secondary)]">NOMINAL</span>
             </div>
          </div>
        </div>

        {/* MIDDLE ROW: The Core Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT COL: Neural Manifest & Vitals */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <ManifestAvatar />

            <div className="hud-panel p-5 rounded-sm">
              <div className="hud-header -mx-5 -mt-5 px-5 py-3 mb-5 flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold uppercase tracking-widest flex items-center gap-2 text-[var(--text-secondary)]">
                  <Brain size={14} className="text-cyan-400" /> Cognitive State
                </span>
                <span className="animate-pulse w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              </div>
              
              <div className="space-y-4">
                {[
                  { label: 'Focus', val: cognitiveState.focus, color: 'bg-indigo-500' },
                  { label: 'Energy Payload', val: cognitiveState.energy, color: 'bg-amber-500' },
                  { label: 'System Stress', val: cognitiveState.stress, color: 'bg-rose-500' },
                  { label: 'Signal Clarity', val: cognitiveState.clarity, color: 'bg-cyan-500' },
                ].map(stat => (
                  <div key={stat.label}>
                    <div className="flex justify-between text-[10px] font-mono font-bold uppercase mb-1.5 text-[var(--text-tertiary)]">
                      <span>{stat.label}</span>
                      <span className="text-[var(--text-primary)]">{stat.val}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                       <div className={`h-full ${stat.color} transition-all duration-1000 ease-out`} style={{ width: `${stat.val}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hub Links to the RPG Core */}
            <div className="grid grid-cols-2 gap-3">
              <Link href="/dashboard/profile" className="hud-panel p-4 flex flex-col items-center justify-center gap-2 hover:bg-[var(--accent-soft)] transition-colors group cursor-pointer">
                 <Fingerprint size={20} className="text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors" />
                 <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)]">Profile</span>
              </Link>
              <Link href="/dashboard/inventory" className="hud-panel p-4 flex flex-col items-center justify-center gap-2 hover:bg-[var(--accent-soft)] transition-colors group cursor-pointer">
                 <Box size={20} className="text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors" />
                 <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)]">Inventory</span>
              </Link>
            </div>
          </div>

          {/* CENTER COL: Neural Stream (Active Elements & Tasks) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Active Directives (Quests) */}
            <div className="hud-panel p-5 rounded-sm">
              <div className="hud-header -mx-5 -mt-5 px-5 py-3 mb-5 flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold uppercase tracking-widest flex items-center gap-2 text-[var(--text-secondary)]">
                  <Crosshair size={14} className="text-rose-400" /> Active Directives
                </span>
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">[ {activeDirectives.length} Targets ]</span>
              </div>
              
              <div className="space-y-3">
                {activeDirectives.length > 0 ? (
                  activeDirectives.map((directive, i) => (
                    <div key={directive.id} className="relative group p-3 bg-[var(--bg-tertiary)]/30 border border-[var(--border-light)] rounded-sm hover:border-[var(--accent)]/50 transition-colors">
                       <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 bg-[var(--bg-primary)] border border-[var(--border-medium)] uppercase text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors">
                              FWD-{i+1}
                            </span>
                            <span className="text-sm font-semibold text-[var(--text-primary)]">{directive.title}</span>
                          </div>
                          <span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm
                            ${directive.priority === 'CRITICAL' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 
                              directive.priority === 'HIGH' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 
                              'bg-[var(--border-medium)] text-[var(--text-tertiary)]'}`
                          }>
                            {directive.priority}
                          </span>
                       </div>
                       <div className="flex items-center gap-3">
                          <div className="flex-1 h-1 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                             <div className="h-full bg-[var(--text-secondary)] group-hover:bg-[var(--accent)] transition-all" style={{ width: `${directive.progress}%` }} />
                          </div>
                          <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{directive.progress}%</span>
                       </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest border border-dashed border-[var(--border-light)]">
                    No active directives found. Mark entities as 'goal' to track.
                  </div>
                )}
              </div>
            </div>

            {/* Neural Momentum (Recent Entities) */}
            <div className="hud-panel p-5 rounded-sm flex-1">
              <div className="hud-header -mx-5 -mt-5 px-5 py-3 mb-5 flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold uppercase tracking-widest flex items-center gap-2 text-[var(--text-secondary)]">
                  <Radio size={14} className="text-[var(--accent)]" /> Neural Momentum
                </span>
                <Link href="/dashboard/entities" className="text-[10px] font-mono text-[var(--accent)] hover:underline flex items-center gap-1">
                  View Core DB <ChevronRight size={10} />
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recentEntities.length > 0 ? (
                  recentEntities.map((entity, i) => (
                    <div key={entity.id} className="p-4 border border-[var(--border-light)] bg-gradient-to-br from-transparent to-[var(--bg-tertiary)]/20 flex gap-4 hover:border-[var(--accent)]/40 transition-colors">
                      <div className="w-8 h-8 rounded-sm bg-[var(--bg-primary)] border border-[var(--border-medium)] flex items-center justify-center flex-shrink-0">
                        {entity.type === 'project' ? <Box size={14} className="text-blue-400" /> : 
                         entity.type === 'idea' ? <Zap size={14} className="text-amber-400" /> : 
                         <Layers size={14} className="text-emerald-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                           <h3 className="text-xs font-bold truncate text-[var(--text-secondary)]">{entity.name}</h3>
                           <span className="text-[9px] font-mono text-[var(--text-tertiary)]">LVL {Math.floor((entity.mention_count || 1) * 1.5)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <div className="flex-1 h-0.5 bg-[var(--border-medium)] opacity-50 relative">
                             <div className="absolute top-0 left-0 h-full bg-[var(--accent)]" style={{ width: `${Math.min((entity.mention_count || 1) * 10, 100)}%` }} />
                           </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 text-center py-6 text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest border border-dashed border-[var(--border-light)]">
                    Awaiting Signal Ingestion...
                  </div>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Emergent Insights */}
              <div className="hud-panel p-5 rounded-sm">
                <div className="hud-header -mx-5 -mt-5 px-5 py-3 mb-5 flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-widest flex items-center gap-2 text-[var(--text-secondary)]">
                    <Brain size={14} className="text-purple-400" /> Emergent Insights
                  </span>
                </div>
                <div className="space-y-4">
                  {insights.length > 0 ? (
                    insights.map((insight) => (
                      <div key={insight.id} className="text-sm text-[var(--text-secondary)] border-l-2 border-purple-500/50 pl-3 py-1">
                        <span className="text-[9px] font-mono text-purple-400 uppercase tracking-widest block mb-1">[{insight.type}]</span>
                        "{insight.text}"
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] font-mono text-[var(--text-tertiary)] italic">No insights extracted from recent signals.</div>
                  )}
                </div>
              </div>

              {/* Recent Transmissions */}
              <div className="hud-panel p-5 rounded-sm">
                <div className="hud-header -mx-5 -mt-5 px-5 py-3 mb-5 flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-widest flex items-center gap-2 text-[var(--text-secondary)]">
                    <Database size={14} className="text-emerald-400" /> Recent Transmissions
                  </span>
                </div>
                <div className="space-y-3">
                  {recentTransmissions.length > 0 ? (
                    recentTransmissions.map((log) => (
                      <Link key={log.id} href={`/dashboard/uploads/${log.id}`} className="flex items-center justify-between p-2 hover:bg-[var(--bg-tertiary)]/50 transition-colors border border-transparent hover:border-[var(--border-light)] rounded-sm group">
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent)]">{log.title || 'Encrypted Transmission'}</span>
                          <span className="text-[9px] font-mono text-[var(--text-tertiary)]">{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-sm uppercase ${log.status === 'processed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                          {log.status}
                        </span>
                      </Link>
                    ))
                  ) : (
                    <div className="text-[10px] font-mono text-[var(--text-tertiary)]">No recent logs.</div>
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
