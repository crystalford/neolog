'use client'

import { useState, useEffect } from 'react'
import {
  Brain, Target, FileText, Scissors, Shield, Sparkles, Zap,
  Tag as TagIcon, Lightbulb, HelpCircle, FolderOpen, CheckCircle2,
  TrendingUp, AlertTriangle, Users, BookOpen, MessageCircle, Play,
  CalendarDays, ChevronRight, Edit2, Quote, Activity, Compass, Fingerprint,
  Layers, Map, Terminal, Cpu
} from 'lucide-react'
import type { VideoUpload, TranscriptWord } from '@/types/database'
import { TranscriptEditor } from '@/components/TranscriptEditor'
import { format } from 'date-fns'

interface SessionDetailProps {
  upload: Partial<VideoUpload> & { analysis: any }
}

export function SessionDetail({ upload }: SessionDetailProps) {
  const [activeTab, setActiveTab] = useState<'analysis' | 'transcript' | 'edit' | 'clips' | 'posts'>('analysis')
  const [transcriptWords, setTranscriptWords] = useState<TranscriptWord[] | null>(null)
  const [loadingWords, setLoadingWords] = useState(false)
  const a = upload.analysis

  useEffect(() => {
    if (activeTab !== 'edit' || transcriptWords !== null || !upload.id) return
    setLoadingWords(true)
    fetch(`/api/transcript-words?upload_id=${upload.id}`)
      .then(r => r.json())
      .then(d => setTranscriptWords(d.words ?? []))
      .finally(() => setLoadingWords(false))
  }, [activeTab, upload.id, transcriptWords])

  const tabs = [
    { key: 'analysis' as const,    label: 'Primary Intel', icon: Terminal },
    { key: 'transcript' as const,  label: 'Log Files',    icon: FileText },
    { key: 'edit' as const,        label: 'Source Edit',  icon: Edit2 },
    { key: 'clips' as const,       label: 'Fragments',    icon: Scissors, count: upload.generated_clips?.length || 0 },
    { key: 'posts' as const,       label: 'Drafts',       icon: MessageCircle, count: upload.generated_posts?.length || 0 },
  ]

  return (
    <div className="session-detail dossier-view">
      {/* Tab Navigation — Ultra Minimal */}
      <div className="flex gap-10 mb-12 border-b border-[var(--border-light)] pb-px overflow-x-auto no-scrollbar">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveTab(tab.key) }}
              className={`flex items-center gap-3 py-4 text-[10px] font-mono font-bold uppercase tracking-[0.3em] transition-all relative ${
                activeTab === tab.key ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)] opacity-50 hover:opacity-100'
              }`}
            >
              <Icon size={14} strokeWidth={1.5} />
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-[-1px] left-0 right-0 h-[1.5px] bg-[var(--accent)]" />
              )}
            </button>
          )
        })}
      </div>

      <div className="tab-content">
        {activeTab === 'analysis' && a && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* COLUMN 1: Narrative & Context (Bento Main) */}
            <div className="lg:col-span-8 space-y-6">
              {/* Central Summary — Editorial Inset */}
              <div className="p-10 bg-[var(--bg-tertiary)]/20 border border-[var(--border-medium)] rounded-sm relative group overflow-hidden">
                 <div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent)] opacity-20" />
                 <h4 className="flex items-center gap-3 text-[9px] font-mono font-bold uppercase tracking-[0.4em] text-[var(--accent)] mb-8 opacity-60">
                   <Quote size={12} /> Narrative Synthesis
                 </h4>
                 <p className="font-serif text-[24px] leading-[1.6] text-[var(--text-primary)] font-light tracking-tight max-w-2xl">
                   {a.summary}
                 </p>
              </div>

              {/* Bento Grid: Projects & Decisions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <BentoCard icon={FolderOpen} title="Domain Manifest" variant="blue">
                  {a.projects?.length > 0 ? (
                    <div className="space-y-6">
                      {a.projects.map((p: any, i: number) => (
                        <div key={i} className="group/project">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-[var(--text-primary)] tracking-wide">{p.name}</span>
                            <span className="text-[8px] font-mono px-1.5 py-0.5 border border-[var(--border-light)] text-[var(--text-tertiary)] uppercase">{p.status}</span>
                          </div>
                          {p.updates?.length > 0 && (
                            <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed italic opacity-80">{p.updates[0]}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : <EmptyState text="No active project links detected." />}
                </BentoCard>

                <BentoCard icon={TrendingUp} title="Strategic Vector" variant="purple">
                  {a.decisions?.length > 0 ? (
                    <div className="space-y-5">
                      {a.decisions.map((d: any, i: number) => (
                        <div key={i} className="pl-3 border-l-[1px] border-[var(--border-heavy)]">
                          <p className="text-[12px] text-[var(--text-secondary)] font-medium mb-1 tracking-tight">{d.decision}</p>
                          {d.reasoning && <p className="text-[10px] text-[var(--text-tertiary)] opacity-60 leading-relaxed font-light">{d.reasoning}</p>}
                        </div>
                      ))}
                    </div>
                  ) : <EmptyState text="No significant decisions archived." />}
                </BentoCard>
              </div>

              {/* Reflections — The 'High Intel' highlight */}
              {a.reflections && (
                <div className="p-10 border border-[var(--border-medium)] bg-gradient-to-br from-[#0a0a14] to-[var(--bg-primary)] rounded-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-[-20%] w-[40%] h-full bg-indigo-500/5 blur-[120px] pointer-events-none" />
                  <div className="absolute top-10 right-10 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Sparkles size={48} className="text-[var(--accent)]" />
                  </div>
                  <h4 className="flex items-center gap-3 text-[9px] font-mono font-bold uppercase tracking-[0.4em] text-[var(--accent)] mb-8">
                     <Fingerprint size={14} /> Synthetic Perspective
                  </h4>
                  <p className="text-[19px] leading-[1.8] text-[var(--text-secondary)] font-light italic tracking-tight opacity-90 relative z-10">
                    &ldquo;{a.reflections}&rdquo;
                  </p>
                </div>
              )}
            </div>

            {/* COLUMN 2: Metadata & Accountability (Bento Sidebar) */}
            <div className="lg:col-span-4 space-y-6">
              {/* Quick Status Bento */}
              <div className="grid grid-cols-2 gap-4">
                 <div className="p-6 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-sm">
                    <p className="text-[8px] font-mono font-bold uppercase tracking-[0.3em] text-[var(--text-tertiary)] mb-4">State</p>
                    <p className="text-sm font-medium text-[var(--text-primary)] tracking-wide">{a.mood || 'Calm'}</p>
                 </div>
                 <div className="p-6 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-sm">
                    <p className="text-[8px] font-mono font-bold uppercase tracking-[0.3em] text-[var(--text-tertiary)] mb-4">Current</p>
                    <p className="text-sm font-medium text-[var(--text-primary)] tracking-wide">{a.energy_level || 'Normal'}</p>
                 </div>
              </div>

              <BentoCard icon={CheckCircle2} title="Tactical Intake" variant="emerald">
                {a.action_items?.length > 0 ? (
                  <div className="space-y-4">
                    {a.action_items.map((item: string, i: number) => (
                      <div key={i} className="flex items-start gap-4 p-3 bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--accent)]/20 transition-all rounded-sm group/item">
                        <div className="mt-1 w-1 h-1 rounded-full bg-[var(--accent)] opacity-40 group-hover/item:opacity-100" />
                        <span className="text-[12px] text-[var(--text-secondary)] font-light leading-relaxed">{item}</span>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState text="Zero tactical items captured." />}
              </BentoCard>

              <BentoCard icon={Lightbulb} title="Conceptual Mapping" variant="amber">
                {a.ideas?.length > 0 ? (
                  <div className="space-y-4">
                    {a.ideas.map((idea: any, i: number) => (
                      <div key={i} className="text-[12px] text-[var(--text-tertiary)] font-light leading-relaxed pb-4 border-b border-[var(--border-light)] last:border-0">
                        {typeof idea === 'object' ? idea.text : idea}
                      </div>
                    ))}
                  </div>
                ) : <EmptyState text="Conceptual slate empty." />}
              </BentoCard>

              <BentoCard icon={Compass} title="Vision & Trajectory" variant="indigo">
                {a.goals?.length > 0 ? (
                  <div className="space-y-4">
                    {a.goals.map((g: any, i: number) => (
                      <div key={i} className="flex flex-col gap-1">
                        <span className="text-[12px] text-[var(--text-secondary)] font-medium">• {g.goal}</span>
                        <span className="text-[8px] font-mono text-[var(--text-tertiary)] opacity-50 uppercase tracking-widest pl-3">{g.timeframe}</span>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState text="No trajectory markers found." />}
              </BentoCard>
            </div>
          </div>
        )}

        {/* Other tabs — Simplified Dossier Styling */}
        {activeTab === 'transcript' && (
          <div className="py-10 max-w-4xl mx-auto">
            {upload.transcript ? (
               <div className="space-y-12">
                  {upload.transcript_segments?.map((seg, i) => (
                    <div key={i} className="flex gap-12 group">
                       <span className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-30 group-hover:opacity-100 transition-opacity w-16 text-right pt-1.5">{formatTimestamp(seg.start)}</span>
                       <p className="text-[16px] leading-[1.8] text-[var(--text-secondary)] font-light tracking-wide group-hover:text-[var(--text-primary)] transition-all duration-700">{seg.text}</p>
                    </div>
                  ))}
               </div>
            ) : <EmptyState text="No transcript record found." />}
          </div>
        )}

        {activeTab === 'edit' && (
          <div className="py-10">
            {loadingWords ? <div className="py-24 text-center animate-pulse text-[10px] font-mono uppercase tracking-[0.4em]">Resyncing Word Stream...</div> : 
             transcriptWords && transcriptWords.length > 0 ? (
               <TranscriptEditor uploadId={upload.id!} words={transcriptWords} onWordsUpdate={setTranscriptWords} />
             ) : <EmptyState text="Word-level metadata unavailable for this node." />}
          </div>
        )}

        {activeTab === 'clips' && (
          <div className="py-10">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {upload.generated_clips?.map((clip, i) => (
                <div key={i} className="group/clip p-8 border border-[var(--border-light)] bg-[var(--bg-secondary)] hover:border-[var(--accent)]/40 transition-all duration-700 rounded-sm">
                   <div className="flex justify-between items-start mb-6">
                      <h5 className="text-xs font-bold text-[var(--text-primary)] tracking-wide">{clip.title}</h5>
                      <span className="text-[9px] font-mono opacity-40">{formatTimestamp(clip.start)}</span>
                   </div>
                   <p className="text-[11px] text-[var(--text-tertiary)] italic leading-relaxed opacity-60 group-hover/clip:opacity-100 transition-opacity">
                     &ldquo;{clip.transcript}&rdquo;
                   </p>
                </div>
              ))}
              {!upload.generated_clips?.length && <div className="col-span-full"><EmptyState text="No high-value fragments identified." /></div>}
            </div>
          </div>
        )}

        {activeTab === 'posts' && (
          <div className="py-10 max-w-2xl">
             <div className="space-y-12">
               {upload.generated_posts?.map((post, i) => (
                 <div key={i} className="relative pl-10 border-l border-[var(--border-light)] group/post">
                    <div className="absolute top-0 left-[-1px] w-[1px] h-full bg-[var(--accent)] opacity-0 group-hover/post:opacity-100 transition-all duration-700" />
                    <span className="text-[8px] font-mono font-bold uppercase tracking-[0.3em] text-[var(--accent)] mb-4 block opacity-50">{post.type}</span>
                    <h5 className="text-[18px] font-bold text-[var(--text-primary)] mb-4 tracking-tight">{post.title}</h5>
                    <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed font-light opacity-80">{post.content}</p>
                 </div>
               ))}
               {!upload.generated_posts?.length && <EmptyState text="Zero derivative drafts generated." />}
             </div>
          </div>
        )}
      </div>
    </div>
  )
}

function BentoCard({ icon: Icon, title, children, variant }: { icon: any; title: string, children: React.ReactNode, variant: string }) {
  return (
    <div className="p-8 border border-[var(--border-light)] bg-[#08080c] rounded-sm relative group hover:border-[var(--border-medium)] transition-all duration-500">
      <h4 className="flex items-center gap-3 text-[9px] font-mono font-bold uppercase tracking-[0.4em] text-[var(--text-tertiary)] mb-8 opacity-40 group-hover:opacity-80 transition-opacity">
        <Icon size={12} strokeWidth={2} /> {title}
      </h4>
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-12 flex flex-col items-center justify-center opacity-20 border border-dashed border-[var(--border-light)] rounded-sm">
      <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-center px-4">{text}</p>
    </div>
  )
}

function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
