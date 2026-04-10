'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  Sparkles, Zap, ArrowRight, BookOpen, X, Film, 
  Brain, Cpu, MessageSquare, History, ChevronRight,
  Radio, Terminal, Target, Activity, Database, Layout, Share2, Loader2, Play
} from 'lucide-react'
import Link from 'next/link'

interface EditorialTopic {
  topic_title: string
  hook: string
  angle: string
  required_elements: string[]
  script_status: string
}

function ScriptModal({ script, onClose }: { script: { topic: string, content: string }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-3xl animate-in fade-in duration-300">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] w-full max-w-4xl max-h-[85vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 border-b border-[var(--border-light)] flex items-center justify-between bg-white/[0.02]">
           <div>
             <h2 className="text-xl font-bold tracking-tight uppercase italic">{script.topic}</h2>
             <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Drafted Script // Neural Protocol 0.8</p>
           </div>
           <button onClick={onClose} className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-[var(--text-tertiary)] hover:text-white transition-all">
             <X size={20} />
           </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-12 font-serif text-xl leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap selection:bg-[var(--accent)] selection:text-white">
           {script.content}
        </div>

        <div className="p-10 border-t border-[var(--border-light)] flex items-center gap-4 bg-white/[0.02]">
           <button 
             onClick={() => {
               navigator.clipboard.writeText(script.content)
             }}
             className="flex-1 py-5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-2xl font-mono text-xs uppercase tracking-[0.2em] font-bold transition-all shadow-xl shadow-[var(--accent)]/30 flex items-center justify-center gap-3"
           >
              Copy Production Artifact
           </button>
        </div>
      </div>
    </div>
  )
}

function ProductionEngineVisualization() {
  const stages = [
    { id: 'signal', label: 'Raw Signal', icon: Radio, status: 'Active', pulse: true },
    { id: 'synthesis', label: 'Cognitive Synthesis', icon: Brain, status: 'Processing', pulse: true },
    { id: 'scripting', label: 'Narrative Scripting', icon: Terminal, status: 'Standby', pulse: false },
    { id: 'assembly', label: 'Neural Assembly', icon: Activity, status: 'Standby', pulse: false },
    { id: 'distribution', label: 'Protocol Export', icon: Share2, status: 'Standby', pulse: false },
  ]

  return (
    <section className="p-10 rounded-[3rem] bg-[var(--bg-card)] border border-[var(--border-light)] shadow-2xl relative overflow-hidden group">
       <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent)]/5 to-transparent pointer-events-none" />
       
       <div className="flex items-center gap-4 mb-12 relative z-10">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shadow-[0_0_8px_var(--accent)]" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-[0.4em] text-[var(--accent)]">Production Engine Topology</span>
       </div>

       <div className="flex flex-col lg:flex-row items-center justify-between gap-8 relative z-10">
          {stages.map((stage, idx) => (
            <div key={stage.id} className="flex flex-col lg:flex-row items-center gap-8 flex-1">
               <div className="flex flex-col items-center gap-4 group/node">
                  <div className={`w-16 h-16 rounded-2xl bg-[var(--bg-secondary)] border ${stage.status !== 'Standby' ? 'border-[var(--accent)]/40' : 'border-[var(--border-light)]'} flex items-center justify-center relative transition-all duration-500 group-hover/node:scale-110`}>
                     <stage.icon size={24} className={stage.status !== 'Standby' ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)] opacity-30'} />
                     {stage.pulse && (
                       <div className="absolute inset-0 rounded-2xl border border-[var(--accent)] animate-ping opacity-20" />
                     )}
                     {stage.status === 'Processing' && (
                       <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-[var(--bg-card)] animate-pulse" />
                     )}
                  </div>
                  <div className="text-center">
                     <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-primary)]">{stage.label}</p>
                     <p className={`text-[8px] font-mono uppercase tracking-[0.2em] mt-1 ${stage.status === 'Active' ? 'text-emerald-500' : stage.status === 'Processing' ? 'text-amber-500' : 'text-[var(--text-tertiary)] opacity-40'}`}>
                        {stage.status}
                     </p>
                  </div>
               </div>

               {idx < stages.length - 1 && (
                 <div className="hidden lg:flex items-center gap-2 opacity-20 flex-1">
                    <div className="h-[2px] w-full bg-gradient-to-r from-[var(--border-light)] to-transparent rounded-full" />
                    <ChevronRight size={14} className="text-[var(--text-tertiary)]" />
                 </div>
               )}
            </div>
          ))}
       </div>

       {/* Engine Specs */}
       <div className="mt-12 pt-8 border-t border-[var(--border-light)]/50 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
             <p className="text-[8px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-1">Signal Buffers</p>
             <p className="text-xs font-bold text-[var(--text-secondary)]">24 Active Manifolds</p>
          </div>
          <div>
             <p className="text-[8px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-1">Synthesis Latency</p>
             <p className="text-xs font-bold text-[var(--text-secondary)]">420ms // P99</p>
          </div>
          <div>
             <p className="text-[8px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-1">Assembly Queue</p>
             <p className="text-xs font-bold text-[var(--text-secondary)]">3 Productions Pending</p>
          </div>
          <div className="text-right">
             <span className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-[var(--accent)]">System_Optimal</span>
          </div>
       </div>
    </section>
  )
}

function EditorialBoardSection({ topics, onRefresh, refreshing, onDraft, drafting }: { topics: EditorialTopic[]; onRefresh: () => void; refreshing: boolean; onDraft: (topic: EditorialTopic) => void; drafting: string | null }) {
  if (!topics || topics.length === 0) return (
    <div className="rounded-[3rem] border-2 border-dashed border-[var(--border-light)] p-24 text-center bg-[var(--bg-card)]/30 backdrop-blur-3xl">
       <div className="w-20 h-20 rounded-[2rem] bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center mx-auto mb-8 border border-[var(--accent)]/20 shadow-2xl">
          <Sparkles size={40} />
       </div>
       <h3 className="text-2xl font-black italic tracking-tight mb-4">Board Latency Detected</h3>
       <p className="text-sm text-[var(--text-tertiary)] max-w-sm mx-auto mb-10 font-light leading-relaxed uppercase tracking-widest">Invoke the cognitive protocol to map your latest narrative vectors.</p>
       <button 
         onClick={onRefresh} 
         disabled={refreshing} 
         className="px-10 py-5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[11px] font-mono uppercase tracking-[0.3em] font-bold rounded-2xl transition-all shadow-2xl shadow-[var(--accent)]/30 disabled:opacity-50 flex items-center justify-center gap-3 mx-auto"
       >
         {refreshing ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
         {refreshing ? 'Triggering Synthesis...' : 'Invoke Editorial Protocol'}
       </button>
    </div>
  )

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <div className="flex items-center justify-between border-b border-[var(--border-light)] pb-8">
        <div className="flex items-center gap-6">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-[var(--accent)]/20 to-transparent border border-[var(--accent)]/20 text-[var(--accent)] shadow-xl"><Database size={28} /></div>
          <div>
            <div className="flex items-center gap-3 mb-1">
               <span className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-[var(--accent)]">Active Manifolds</span>
               <div className="w-1 h-3 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <h2 className="text-3xl font-black tracking-tighter uppercase italic">Board Directives</h2>
          </div>
        </div>
        <button 
          onClick={onRefresh} 
          disabled={refreshing}
          className="px-8 py-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--accent)]/40 text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-all flex items-center gap-4 group disabled:opacity-50 shadow-sm"
        >
           {refreshing ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />}
           {refreshing ? 'Synthesizing...' : 'Refresh Matrix'} 
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
        {topics.map((topic, i) => (
          <div key={i} className="group relative bg-[var(--bg-card)]/50 backdrop-blur-2xl border border-[var(--border-light)] hover:border-[var(--accent)]/40 rounded-[3rem] p-12 transition-all duration-700 hover:shadow-[0_0_60px_rgba(124,106,245,0.05)] flex flex-col">
            <div className="absolute top-0 right-12 w-24 h-[2px] bg-gradient-to-r from-transparent via-[var(--accent)]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="space-y-8 flex-1 relative z-10">
              <div className="flex items-center justify-between mb-2">
                 <span className="text-[10px] font-mono text-[var(--accent)] font-bold tracking-[0.3em] uppercase">Topic_Vector_{i+1}</span>
                 <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[8px] font-mono font-bold text-[var(--text-tertiary)] uppercase whitespace-nowrap">
                    Ready for Draft
                 </div>
              </div>

              <h3 className="text-3xl font-bold leading-tight tracking-tight uppercase italic group-hover:text-[var(--accent)] transition-colors duration-500">{topic.topic_title}</h3>
              
              <div className="relative">
                <div className="absolute -left-6 top-1 bottom-1 w-[2px] bg-[var(--accent)]/20 rounded-full group-hover:bg-[var(--accent)]/60 transition-colors" />
                <p className="text-lg text-[var(--text-secondary)] leading-relaxed font-serif italic pl-4">
                  "{topic.hook}"
                </p>
              </div>
              
              <div className="space-y-3">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-[var(--text-tertiary)] font-black flex items-center gap-3">
                  <Brain size={14} className="opacity-40" /> Cognitive Angle
                </p>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed font-light">{topic.angle}</p>
              </div>

              {topic.required_elements?.length > 0 && (
                <div className="flex flex-wrap gap-3 pt-6">
                  {topic.required_elements.map((el, j) => (
                    <span key={j} className="text-[9px] font-mono font-bold px-4 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-tertiary)] uppercase tracking-wider group-hover:border-[var(--accent)]/20 transition-all">
                      {el}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-12 mt-auto relative z-10">
              <button 
                onClick={() => onDraft(topic)}
                disabled={Boolean(drafting)}
                className="w-full py-6 rounded-2xl bg-[var(--accent)]/5 hover:bg-[var(--accent)] text-[var(--accent)] hover:text-white text-[11px] font-mono uppercase tracking-[0.4em] font-black transition-all duration-700 flex items-center justify-center gap-4 border border-[var(--accent)]/20 hover:border-[var(--accent)] hover:shadow-[0_0_30px_var(--accent)/20] disabled:opacity-30"
              >
                {drafting === topic.topic_title ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Drafting Intelligence Artifact...
                  </>
                ) : (
                  <>
                    <BookOpen size={18} /> Initialize Production Script
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RotateCcw(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}

export default function StudioPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [drafting, setDrafting] = useState<string | null>(null)
  const [selectedScript, setSelectedScript] = useState<{ topic: string, content: string } | null>(null)
  const [editorialTopics, setEditorialTopics] = useState<EditorialTopic[]>([])

  useEffect(() => {
    loadStudioData()
  }, [])

  const loadStudioData = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: synthesisData } = await supabase
      .from('user_synthesis')
      .select('editorial_board')
      .eq('user_id', session.user.id)
      .not('editorial_board', 'is', null)
      .order('synthesized_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (synthesisData) {
      setEditorialTopics((synthesisData as any).editorial_board || [])
    }
    setLoading(false)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/synthesize-graph', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to trigger synthesis')
      console.log('Synthesis queued')
      alert('Cognitive synthesis protocol initiated. Please wait for signal integration.')
    } catch (err: any) {
      console.error(err)
      alert(err.message)
    } finally {
      setTimeout(() => setRefreshing(false), 3000)
    }
  }

  const handleDraftScript = async (topic: EditorialTopic) => {
    setDrafting(topic.topic_title)
    try {
      const res = await fetch('/api/editorial/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(topic)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate script')
      setSelectedScript({ topic: topic.topic_title, content: data.script })
    } catch (err: any) {
      console.error(err)
      alert(err.message)
    } finally {
      setDrafting(null)
    }
  }

  if (loading) {
    return (
      <div className="p-16 animate-pulse space-y-16">
        <div className="h-20 w-[400px] bg-[var(--bg-secondary)] rounded-3xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="h-[600px] bg-[var(--bg-secondary)] rounded-[3rem]" />
          <div className="h-[600px] bg-[var(--bg-secondary)] rounded-[3rem]" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] relative font-sans overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 right-0 w-[60%] h-[700px] bg-gradient-to-bl from-[var(--accent)]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto px-10 py-20 space-y-20 relative z-10">
        
        {/* Terminal Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-12 group">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
               <div className="p-3 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-indigo-600 text-white shadow-2xl group-hover:rotate-[10deg] transition-transform duration-700">
                  <Film size={32} />
               </div>
               <div className="flex flex-col">
                  <div className="flex items-center gap-3 mb-1">
                     <span className="text-[10px] font-mono font-bold uppercase tracking-[0.4em] text-[var(--accent)]">Production Engine Status: Ready</span>
                     <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  </div>
                  <h1 className="text-5xl lg:text-7xl font-black tracking-tighter uppercase italic">The Studio</h1>
               </div>
            </div>
            <p className="text-lg lg:text-xl text-[var(--text-secondary)] font-light max-w-2xl leading-relaxed">
               Where raw intellectual data is synthesized into cinematic narrative artifacts. <br /> Initialize your <span className="text-[var(--text-primary)] font-bold italic underline decoration-[var(--accent)]/30 underline-offset-8">Production Logic</span> below.
            </p>
          </div>

          <div className="flex items-center gap-10">
             <div className="text-right space-y-1">
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)] opacity-60">Engine Load</p>
                <div className="flex justify-end gap-1">
                   {[1,2,3,4,5,6,7].map(i => (
                     <div key={i} className={`h-4 w-1 rounded-sm ${i < 4 ? 'bg-emerald-500/40' : 'bg-white/5'}`} />
                   ))}
                </div>
             </div>
             <button className="px-8 py-4 rounded-2xl bg-black text-white text-[11px] font-mono font-bold uppercase tracking-widest border border-white/10 hover:border-white/30 transition-all shadow-2xl">
               System Prefs
             </button>
          </div>
        </header>

        {/* Engine Visualization */}
        <ProductionEngineVisualization />

        {/* Editorial Board */}
        <EditorialBoardSection 
          topics={editorialTopics} 
          onRefresh={handleRefresh} 
          refreshing={refreshing} 
          onDraft={handleDraftScript}
          drafting={drafting}
        />

        {selectedScript && (
          <ScriptModal 
            script={selectedScript} 
            onClose={() => setSelectedScript(null)} 
          />
        )}

      </div>
    </div>
  )
}
