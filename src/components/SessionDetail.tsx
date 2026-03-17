'use client'

import { useState, useEffect } from 'react'
import {
  Brain, Target, FileText, Scissors, Shield, Sparkles, Zap,
  Tag as TagIcon, Lightbulb, HelpCircle, FolderOpen, CheckCircle2,
  TrendingUp, AlertTriangle, Users, BookOpen, MessageCircle, Play,
  CalendarDays, ChevronRight, Edit2, Quote, Activity, Compass, Fingerprint,
  Layers, Map, Terminal, Cpu, Braces
} from 'lucide-react'
import type { VideoUpload, TranscriptWord } from '@/types/database'
import { TranscriptEditor } from '@/components/TranscriptEditor'
import { format } from 'date-fns'

interface SessionDetailProps {
  upload: Partial<VideoUpload> & { analysis: any }
}

export function SessionDetail({ upload }: SessionDetailProps) {
  const [activeTab, setActiveTab] = useState<'intel' | 'synthesis' | 'log' | 'clips' | 'posts'>('intel')
  const [transcriptWords, setTranscriptWords] = useState<TranscriptWord[] | null>(null)
  const [loadingWords, setLoadingWords] = useState(false)
  const a = upload.analysis

  useEffect(() => {
    if (activeTab !== 'log' || transcriptWords !== null || !upload.id) return
    setLoadingWords(true)
    fetch(`/api/transcript-words?upload_id=${upload.id}`)
      .then(r => r.json())
      .then(d => setTranscriptWords(d.words ?? []))
      .finally(() => setLoadingWords(false))
  }, [activeTab, upload.id, transcriptWords])

  const tabs = [
    { key: 'intel' as const,      label: 'Intel',       icon: Braces },
    { key: 'synthesis' as const,  label: 'Synthesis',   icon: Sparkles },
    { key: 'log' as const,        label: 'Logs',        icon: Terminal },
    { key: 'clips' as const,      label: 'Fragments',   icon: Scissors, count: upload.generated_clips?.length || 0 },
    { key: 'posts' as const,      label: 'Drafts',      icon: MessageCircle, count: upload.generated_posts?.length || 0 },
  ]

  return (
    <div className="session-detail-v6">
      {/* Refined Tab Nav (No Cyan) */}
      <div className="flex gap-10 mb-12 border-b border-[var(--border-light)] pb-px overflow-x-auto no-scrollbar">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveTab(tab.key) }}
              className={`flex items-center gap-3 py-4 text-[10px] font-mono font-black uppercase tracking-[0.2em] transition-all relative ${
                activeTab === tab.key ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] opacity-60 hover:opacity-100 hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon size={14} strokeWidth={2} className={activeTab === tab.key ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'} />
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[var(--text-primary)]" />
              )}
            </button>
          )
        })}
      </div>

      <div className="tab-content">
        {activeTab === 'intel' && a && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
            {/* Bento Grid — Relaxed constraints */}
            <div className="lg:col-span-8 flex flex-col gap-2">
               <div className="p-10 border border-[var(--border-light)] rounded-lg">
                  <h4 className="flex items-center gap-2 text-[9px] font-mono font-black uppercase tracking-widest text-[var(--text-tertiary)] mb-6 opacity-40">
                    <Target size={12} /> Narrative Core
                  </h4>
                  <p className="text-[17px] leading-relaxed text-[var(--text-primary)] font-light tracking-wide">
                    {a.summary}
                  </p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <AnalystCard title="Projects" icon={FolderOpen} color="text-blue-400">
                    {a.projects?.length > 0 ? (
                      <div className="space-y-4">
                        {a.projects.map((p: any, i: number) => (
                          <div key={i} className="flex flex-col">
                            <span className="text-[13px] font-bold text-[var(--text-primary)] mb-1">{p.name}</span>
                            <span className="text-[11px] text-[var(--text-secondary)] leading-relaxed opacity-70">{p.updates?.[0]}</span>
                          </div>
                        ))}
                      </div>
                    ) : <span className="text-[10px] opacity-30 italic">No domain links</span>}
                  </AnalystCard>

                  <AnalystCard title="Decisions" icon={Activity} color="text-emerald-400">
                    {a.decisions?.length > 0 ? (
                      <div className="space-y-4">
                        {a.decisions.map((d: any, i: number) => (
                          <div key={i} className="flex flex-col">
                            <span className="text-[13px] font-bold text-[var(--text-secondary)] mb-1">{d.decision}</span>
                            <span className="text-[11px] text-[var(--text-tertiary)] opacity-60 leading-relaxed">{d.reasoning}</span>
                          </div>
                        ))}
                      </div>
                    ) : <span className="text-[10px] opacity-30 italic">No decisions logged</span>}
                  </AnalystCard>
               </div>
            </div>

            <div className="lg:col-span-4 flex flex-col gap-2">
               <AnalystCard title="Tactical Intake" icon={CheckCircle2} color="text-amber-400">
                  {a.action_items?.length > 0 ? (
                    <div className="space-y-3">
                      {a.action_items.map((item: string, i: number) => (
                        <div key={i} className="text-[12px] text-[var(--text-secondary)] py-2 border-b border-[var(--border-light)] last:border-0 flex items-start gap-3">
                          • {item}
                        </div>
                      ))}
                    </div>
                  ) : <span className="text-[10px] opacity-30 italic">Zero intake</span>}
               </AnalystCard>

               <AnalystCard title="Conceptual" icon={Lightbulb} color="text-purple-400">
                  {a.ideas?.length > 0 ? (
                    <div className="space-y-4 text-[12px] text-[var(--text-tertiary)] leading-relaxed italic opacity-80">
                       {a.ideas.map((idea: any, i: number) => (
                         <div key={i}>&ldquo;{typeof idea === 'object' ? idea.text : idea}&rdquo;</div>
                       ))}
                    </div>
                  ) : <span className="text-[10px] opacity-30 italic">No conceptual mappings</span>}
               </AnalystCard>
            </div>
          </div>
        )}

        {activeTab === 'synthesis' && (
           <div className="py-20 px-10 border border-[var(--border-light)] rounded-xl">
              <h4 className="flex items-center gap-3 text-[10px] font-mono font-black uppercase tracking-[0.4em] text-[var(--text-tertiary)] mb-10 opacity-30">
                <Fingerprint size={14} /> Synthetic Perspective
              </h4>
              <p className="text-[18px] leading-[1.8] text-[var(--text-secondary)] font-normal">
                {a?.reflections || "Synthesis currently offline for this node."}
              </p>
           </div>
        )}

        {activeTab === 'log' && (
          <div className="px-10">
            {upload.transcript ? (
               <div className="space-y-8">
                  {upload.transcript_segments?.map((seg, i) => (
                    <div key={i} className="flex gap-10 group">
                       <span className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-30 w-16 pt-1 font-bold">{formatTimestamp(seg.start)}</span>
                       <p className="text-[15px] leading-relaxed text-[var(--text-secondary)] opacity-100 font-light">{seg.text}</p>
                    </div>
                  ))}
               </div>
            ) : <EmptyState text="Log record empty." />}
          </div>
        )}

        {activeTab === 'clips' && (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {upload.generated_clips?.map((clip, i) => (
                <div key={i} className="p-6 border border-[var(--border-light)] bg-[var(--bg-secondary)] rounded-lg">
                   <h5 className="text-[12px] font-bold text-[var(--text-primary)] mb-3">{clip.title}</h5>
                   <p className="text-[11px] text-[var(--text-tertiary)] opacity-60 line-clamp-3 italic leading-relaxed">&ldquo;{clip.transcript}&rdquo;</p>
                </div>
              ))}
              {!upload.generated_clips?.length && <EmptyState text="Zero fragments found." />}
           </div>
        )}

        {activeTab === 'posts' && (
           <div className="max-w-2xl space-y-12">
              {upload.generated_posts?.map((post, i) => (
                <div key={i} className="p-10 border border-[var(--border-light)] bg-[var(--bg-secondary)] rounded-lg">
                   <span className="text-[9px] font-mono opacity-30 uppercase tracking-[0.3em] mb-4 block">{post.type}</span>
                   <h5 className="text-[16px] font-bold mb-4">{post.title}</h5>
                   <p className="text-[14px] text-[var(--text-secondary)] font-light leading-[1.8]">{post.content}</p>
                </div>
              ))}
              {!upload.generated_posts?.length && <EmptyState text="No drafts." />}
           </div>
        )}
      </div>
    </div>
  )
}

function AnalystCard({ title, icon: Icon, color, children }: { title: string, icon: any, color?: string, children: React.ReactNode }) {
  return (
    <div className="p-8 border border-[var(--border-light)] rounded-lg hover:border-[var(--border-medium)] transition-colors duration-500">
      <h4 className={`flex items-center gap-2 text-[9px] font-mono font-black uppercase tracking-widest ${color || 'text-[var(--text-tertiary)]'} mb-6 opacity-60`}>
        <Icon size={12} strokeWidth={3} /> {title}
      </h4>
      {children}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-24 flex flex-col items-center justify-center opacity-10 border border-dashed border-[var(--border-light)] rounded-lg">
      <p className="text-[10px] font-mono uppercase tracking-[0.6em] text-center font-black">{text}</p>
    </div>
  )
}

function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
