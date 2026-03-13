'use client'

import { useState, useEffect } from 'react'
import { 
  Briefcase, ChevronRight, Clock, Sparkles, Loader2, 
  CheckCircle, ArrowRight, BookOpen, Target, Globe, 
  Download, Copy, ExternalLink
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function PortfolioPage() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [generatingBio, setGeneratingBio] = useState(false)
  const [generatingProject, setGeneratingProject] = useState<string | null>(null)
  const [activeProject, setActiveProject] = useState<string | null>(null)

  const supabase = createClient()

  const loadData = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const [
      { data: profileData },
      { data: projectData }
    ] = await Promise.all([
      supabase.from('profiles').select('display_name, username, bio, avatar_url').eq('id', session.user.id).single(),
      supabase.from('entities').select('*').eq('user_id', session.user.id).eq('type', 'project').order('mention_count', { ascending: false }).limit(20)
    ])

    setProfile(profileData)
    setProjects(projectData || [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleGenerateBio = async () => {
    setGeneratingBio(true)
    try {
      const res = await fetch('/api/portfolio/generate', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setProfile(prev => ({ ...prev, bio: data.bio }))
      }
    } catch (err) {
      console.error('Failed to generate bio:', err)
    } finally {
      setGeneratingBio(false)
    }
  }

  const handleGenerateCaseStudy = async (projectId: string) => {
    setGeneratingProject(projectId)
    try {
      const res = await fetch(`/api/portfolio/project/${projectId}/generate`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setProjects(prev => prev.map(p => p.id === projectId ? { ...p, metadata: { ...p.metadata, case_study: data.caseStudy }, summary: data.caseStudy.summary } : p))
      }
    } catch (err) {
      console.error('Failed to generate case study:', err)
    } finally {
      setGeneratingProject(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="animate-spin text-[var(--accent)]" size={32} />
      </div>
    )
  }

  const name = profile?.display_name || profile?.username || 'You'

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 md:py-12 space-y-12">
      {/* HUD Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[var(--border-light)] pb-8">
        <div>
          <p className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-[var(--text-tertiary)] mb-2">Narrative Architecture v2.0</p>
          <h1 className="text-4xl font-bold tracking-tight text-[var(--text-primary)]">Public Portfolio</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-2 italic flex items-center gap-2">
            <CheckCircle size={14} className="text-emerald-400" /> Auto-synthesized from neural activity logs.
          </p>
        </div>
        <div className="flex items-center gap-3">
           <button className="btn btn-secondary btn-sm flex items-center gap-2 border-[var(--border-medium)]">
             <Download size={14} /> Export
           </button>
           <button className="btn btn-primary btn-sm flex items-center gap-2 shadow-lg shadow-[var(--accent)]/20">
             <Globe size={14} /> View Public Log
           </button>
        </div>
      </div>

      {/* Bio Synthesis Section */}
      <section className="relative group">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] flex items-center gap-2">
            <BookOpen size={14} className="text-[var(--accent)]" /> Living Bio
          </h2>
          <button 
            onClick={handleGenerateBio}
            disabled={generatingBio}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] hover:text-white transition-colors disabled:opacity-50"
          >
            {generatingBio ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {generatingBio ? 'Synthesizing...' : 'Regenerate Narrative'}
          </button>
        </div>
        
        <div className="relative p-8 rounded-3xl bg-[var(--bg-secondary)] border border-[var(--border-light)] shadow-sm group-hover:border-[var(--border-medium)] transition-all">
          <div className="absolute -top-3 -left-3 w-6 h-6 border-t-2 border-l-2 border-[var(--accent)] opacity-40" />
          <div className="absolute -bottom-3 -right-3 w-6 h-6 border-b-2 border-r-2 border-[var(--accent)] opacity-40" />
          
          {profile?.bio ? (
            <div className="prose prose-invert max-w-none">
              <p className="text-lg text-[var(--text-primary)] leading-relaxed font-serif opacity-90">{profile.bio}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 opacity-50">
               <Sparkles size={32} className="mb-4 text-[var(--accent)]" />
               <p className="text-sm italic">No narrative bio detected. Click "Regenerate" to synthesize one from your history.</p>
            </div>
          )}
          
          <div className="mt-8 flex items-center gap-4 pt-6 border-t border-white/5">
             <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-6 h-6 rounded-full bg-[var(--accent)]/20 border border-white/10 flex items-center justify-center text-[8px] font-bold">PT</div>
                ))}
             </div>
             <p className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold tracking-widest">Informed by {projects.length} verified project nodes</p>
          </div>
        </div>
      </section>

      {/* Grid of Projects / Case Studies */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] flex items-center gap-2">
            <Briefcase size={14} className="text-blue-400" /> Evidence Library
          </h2>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-[var(--border-light)] rounded-3xl bg-black/5">
             <Briefcase size={40} className="mx-auto mb-4 opacity-20" />
             <p className="font-medium text-[var(--text-secondary)]">No artifacts detected</p>
             <p className="text-sm text-[var(--text-tertiary)] mt-1">Projects will emerge as you mention them in your daily signals.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => {
              const caseStudy = project.metadata?.case_study
              const isGenerating = generatingProject === project.id
              const hasCaseStudy = !!caseStudy

              return (
                <div 
                  key={project.id}
                  className={`group relative flex flex-col p-6 rounded-3xl border transition-all duration-300 ${
                    hasCaseStudy 
                    ? 'bg-[var(--bg-card)] border-blue-400/20 hover:border-blue-400/40 shadow-blue-500/5 shadow-xl' 
                    : 'bg-black/20 border-white/5 grayscale opacity-70 hover:grayscale-0 hover:opacity-100 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                      hasCaseStudy ? 'bg-blue-400/10 text-blue-400' : 'bg-white/5 text-[var(--text-tertiary)] group-hover:bg-blue-400/10 group-hover:text-blue-400'
                    }`}>
                      <Briefcase size={18} strokeWidth={1.5} />
                    </div>
                    <button 
                      onClick={() => handleGenerateCaseStudy(project.id)}
                      disabled={isGenerating}
                      className="p-2 rounded-lg hover:bg-white/5 text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                      title="Generate Case Study"
                    >
                      {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    </button>
                  </div>

                  <div className="flex-1 space-y-3">
                    <h3 className="font-bold text-[var(--text-primary)] group-hover:text-blue-400 transition-colors">
                      {project.name}
                    </h3>
                    
                    {caseStudy?.summary ? (
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                        {caseStudy.summary}
                      </p>
                    ) : project.summary ? (
                      <p className="text-xs text-[var(--text-tertiary)] italic line-clamp-3">
                        {project.summary}
                      </p>
                    ) : (
                      <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-tighter">Draft project node detected. Narrative missing.</p>
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <TrendingUp size={10} className="text-blue-400" />
                       <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{project.mention_count} signals</span>
                    </div>
                    {hasCaseStudy && (
                      <button 
                        onClick={() => setActiveProject(project.id)}
                        className="text-[10px] font-bold uppercase tracking-widest text-blue-400 flex items-center gap-1 group-hover:gap-2 transition-all"
                      >
                        Read Case Study <ArrowRight size={10} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Case Study Modal (Simplified for now) */}
      {activeProject && projects.find(p => p.id === activeProject)?.metadata?.case_study && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-12">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={() => setActiveProject(null)} />
           <div className="relative w-full max-w-3xl bg-[var(--bg-card)] border border-[var(--border-medium)] rounded-[2rem] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
              <div className="p-8 sm:p-12 space-y-8 max-h-[80vh] overflow-y-auto no-scrollbar">
                {(() => {
                  const p = projects.find(p => p.id === activeProject)
                  const cs = p.metadata.case_study
                  return (
                    <>
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 text-blue-400">
                          <Briefcase size={20} />
                          <span className="text-xs font-bold uppercase tracking-[0.3em]">Project Case Study</span>
                        </div>
                        <h2 className="text-3xl font-bold">{p.name}</h2>
                        <div className="flex flex-wrap gap-2 pt-2">
                          {cs.tags?.map((t: string) => (
                            <span key={t} className="px-2 py-1 rounded-lg bg-blue-400/10 text-blue-400 text-[10px] font-mono uppercase">#{t}</span>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                          <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-2">
                            <Target size={12} className="text-red-400" /> The Challenge
                          </h4>
                          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{cs.challenge}</p>
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-2">
                            <Zap size={12} className="text-cyan-400" /> The Approach
                          </h4>
                          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{cs.approach}</p>
                        </div>
                      </div>

                      <div className="p-6 rounded-2xl bg-emerald-400/5 border border-emerald-400/20 space-y-2">
                        <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                          <CheckCircle size={12} /> Key Results & Decision Artifacts
                        </h4>
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{cs.results}</p>
                      </div>

                      <button 
                        onClick={() => setActiveProject(null)}
                        className="w-full py-4 text-[10px] font-bold uppercase tracking-widest border border-white/5 hover:bg-white/5 rounded-2xl transition-all"
                      >
                        Return to Library
                      </button>
                    </>
                  )
                })()}
              </div>
           </div>
        </div>
      )}
    </div>
  )
}
