'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  Sparkles, Zap, ArrowRight, BookOpen, X, Film, 
  Brain, Cpu, MessageSquare, History, ChevronRight
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'

interface EditorialTopic {
  topic_title: string
  hook: string
  angle: string
  required_elements: string[]
  script_status: string
}

function ScriptModal({ script, onClose }: { script: { topic: string, content: string }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] w-full max-w-4xl max-h-[85vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 border-b border-[var(--border-light)] flex items-center justify-between bg-white/[0.02]">
           <div>
             <h2 className="text-xl font-bold tracking-tight">{script.topic}</h2>
             <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Drafted Script (AI Refined)</p>
           </div>
           <button onClick={onClose} className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-[var(--text-tertiary)] hover:text-white transition-all">
             <X size={20} />
           </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-10 font-serif text-lg leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap selection:bg-[var(--accent)] selection:text-white">
           {script.content}
        </div>

        <div className="p-8 border-t border-[var(--border-light)] flex items-center gap-4 bg-white/[0.02]">
           <button 
             onClick={() => {
               navigator.clipboard.writeText(script.content)
               alert('Script copied to clipboard!')
             }}
             className="flex-1 py-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-2xl font-mono text-xs uppercase tracking-[0.2em] font-bold transition-all shadow-lg shadow-[var(--accent)]/20 flex items-center justify-center gap-2"
           >
              Copy Script
           </button>
        </div>
      </div>
    </div>
  )
}

function EditorialBoardSection({ topics, onRefresh, refreshing, onDraft, drafting }: { topics: EditorialTopic[]; onRefresh: () => void; refreshing: boolean; onDraft: (topic: EditorialTopic) => void; drafting: string | null }) {
  if (!topics || topics.length === 0) return (
    <div className="rounded-[3rem] border border-dashed border-[var(--border-light)] p-20 text-center bg-white/[0.01]">
       <div className="w-16 h-16 rounded-3xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center mx-auto mb-6">
          <Sparkles size={32} />
       </div>
       <h3 className="text-xl font-bold mb-2">Editorial Board Offline</h3>
       <p className="text-sm text-[var(--text-tertiary)] max-w-xs mx-auto mb-8 font-serif leading-relaxed italic">The synthesis engine requires manual invocation to map your latest intellectual peaks.</p>
       <button 
         onClick={onRefresh} 
         disabled={refreshing} 
         className="px-8 py-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[10px] font-mono uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-[var(--accent)]/20 disabled:opacity-50"
       >
         {refreshing ? 'Triggering Synthesis...' : 'Invoke Editorial Board'}
       </button>
    </div>
  )

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] shadow-inner"><Sparkles size={24} /></div>
          <div>
            <h2 className="text-2xl font-black tracking-tight">Active Production Queue</h2>
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.3em] font-mono mt-1">AI-Synthesized Narrative Hooks & Script Ready Topics</p>
          </div>
        </div>
        <button 
          onClick={onRefresh} 
          disabled={refreshing}
          className="px-6 py-3 rounded-2xl bg-white/5 border border-white/5 hover:border-[var(--accent)]/20 text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-all flex items-center gap-3 group disabled:opacity-50"
        >
           {refreshing ? 'Synthesizing...' : 'Re-Invoke Board'} <ArrowRight size={12} className={`group-hover:translate-x-1 transition-transform ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {topics.map((topic, i) => (
          <div key={i} className="group relative bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--accent)]/40 rounded-[3rem] p-10 transition-all hover:shadow-3xl hover:shadow-[var(--accent)]/10 flex flex-col overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[var(--accent)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity blur-2xl" />
            
            <div className="space-y-6 flex-1 relative z-10">
              <div className="flex items-center gap-3">
                 <span className="text-[10px] font-mono text-[var(--accent)] px-2 py-0.5 rounded-full bg-[var(--accent)]/10">TOPIC {i+1}</span>
                 <div className="h-px flex-1 bg-[var(--border-light)]" />
              </div>

              <h3 className="text-2xl font-bold leading-tight group-hover:text-[var(--accent)] transition-colors">{topic.topic_title}</h3>
              
              <div className="relative">
                <div className="absolute -left-4 top-0 bottom-0 w-1 bg-[var(--accent)]/20 rounded-full" />
                <p className="text-base text-[var(--text-secondary)] leading-relaxed font-serif italic pl-4 py-1">
                  "{topic.hook}"
                </p>
              </div>
              
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-2">
                  <Brain size={12} /> The Production Angle
                </p>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{topic.angle}</p>
              </div>

              {topic.required_elements?.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-4">
                  {topic.required_elements.map((el, j) => (
                    <span key={j} className="text-[10px] px-3 py-1 rounded-xl bg-white/5 border border-white/5 text-[var(--text-tertiary)] whitespace-nowrap">
                      # {el}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-10 mt-auto relative z-10">
              <button 
                onClick={() => onDraft(topic)}
                disabled={Boolean(drafting)}
                className="w-full py-5 rounded-2xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[11px] font-mono uppercase tracking-[0.3em] font-bold transition-all flex items-center justify-center gap-3 shadow-2xl shadow-[var(--accent)]/30 disabled:opacity-50"
              >
                {drafting === topic.topic_title ? (
                  <>
                    <Cpu size={16} className="animate-spin" /> Drafting Script...
                  </>
                ) : (
                  <>
                    <BookOpen size={16} /> Draft Full Production Script
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
      // Poll or wait a bit? For now, just let it work in background
      alert('Brain synthesis initiated. Refresh page in a minute to see updated board.')
    } catch (err: any) {
      console.error(err)
      alert(err.message)
    } finally {
      setTimeout(() => setRefreshing(false), 2000)
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
      <div className="p-12 animate-pulse space-y-8">
        <div className="h-8 w-48 bg-white/5 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="h-96 bg-white/5 rounded-[3rem]" />
          <div className="h-96 bg-white/5 rounded-[3rem]" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-8 lg:p-12 space-y-16">
      <div className="max-w-7xl mx-auto space-y-16">
        
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-mono uppercase tracking-widest border border-[var(--accent)]/20">
              <Film size={12} /> Neural Production Engine Active
            </div>
            <h1 className="text-5xl lg:text-7xl font-black tracking-tighter">Studio</h1>
            <p className="text-lg text-[var(--text-secondary)] font-serif max-w-2xl leading-relaxed italic">
              Where raw intellectual signals are distilled into cinematic output. Use the board to find your next breakthrough topic.
            </p>
          </div>
          <div className="flex items-center gap-6">
             <div className="text-right hidden sm:block">
                <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-1">Production Status</p>
                <p className="text-sm font-bold flex items-center justify-end gap-2">Ready for Draft <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" /></p>
             </div>
          </div>
        </header>

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
