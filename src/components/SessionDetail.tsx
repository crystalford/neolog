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
    <div className="session-detail-analyst">
      {/* Analyst Tab Nav — High Density */}
      <div className="flex gap-10 mb-12 border-b border-[var(--border-light)] overflow-x-auto no-scrollbar">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveTab(tab.key) }}
              className={`flex items-center gap-3 py-4 text-[10px] font-mono font-black uppercase tracking-[0.3em] transition-all relative ${
                activeTab === tab.key ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)] opacity-60 hover:opacity-100 hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon size={14} strokeWidth={2} />
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)]" />
              )}
            </button>
          )
        })}
      </div>

      <div className="tab-content">
        {activeTab === 'intel' && a && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-1.5">
            {/* Bento Grid — Max Density */}
            <div className="lg:col-span-8 flex flex-col gap-1.5">
               <div className="p-8 bg-[var(--bg-tertiary)]/50 border border-[var(--border-medium)] rounded-sm">
                  <h4 className="flex items-center gap-2 text-[9px] font-mono font-black uppercase tracking-widest text-[var(--accent)] mb-6 opacity-80">
                    <Target size={12} /> Narrative Core
                  </h4>
                  <p className="text-[17px] leading-relaxed text-[var(--text-primary)] font-light tracking-wide">
                    {a.summary}
                  </p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  <AnalystCard title="Domain Manifest" icon={FolderOpen}>
                    {a.projects?.length > 0 ? (
                      <div className="space-y-4">
                        {a.projects.map((p: any, i: number) => (
                          <div key={i} className="flex flex-col">
                            <span className="text-[12px] font-bold text-[var(--text-primary)] mb-1">{p.name}</span>
                            <span className="text-[10px] text-[var(--text-secondary)] italic line-clamp-2 leading-relaxed opacity-80">{p.updates?.[0]}</span>
                          </div>
                        ))}
                      </div>
                    ) : <span className="text-[10px] opacity-30 italic">No domain links found.</span>}
                  </AnalystCard>

                  <AnalystCard title="Strategic Vector" icon={Activity}>
                    {a.decisions?.length > 0 ? (
                      <div className="space-y-4">
                        {a.decisions.map((d: any, i: number) => (
                          <div key={i} className="flex flex-col border-l-2 border-[var(--accent-soft)] pl-4 py-1">
                            <span className="text-[12px] font-bold text-[var(--text-secondary)] mb-1">{d.decision}</span>
                            <span className="text-[10px] text-[var(--text-tertiary)] opacity-80 line-clamp-2">{d.reasoning}</span>
                          </div>
                        ))}
                      </div>
                    ) : <span className="text-[10px] opacity-30 italic">No decisions archived.</span>}
                  </AnalystCard>
               </div>
            </div>

            <div className="lg:col-span-4 flex flex-col gap-1.5">
               <AnalystCard title="Tactical Intake" icon={CheckCircle2}>
                  {a.action_items?.length > 0 ? (
                    <div className="space-y-3">
                      {a.action_items.map((item: string, i: number) => (
                        <div key={i} className="text-[12px] text-[var(--text-secondary)] py-2 border-b border-[var(--border-light)] last:border-0 flex items-start gap-3">
                          <span className="text-[var(--accent)] mt-1">•</span>
                          {item}
                        </div>
                      ))}
                    </div>
                  ) : <span className="text-[10px] opacity-30 italic">Zero tactical items.</span>}
               </AnalystCard>

               <AnalystCard title="Conceptual Map" icon={Lightbulb}>
                  {a.ideas?.length > 0 ? (
                    <div className="space-y-4">
                       {a.ideas.map((idea: any, i: number) => (
                         <div key={i} className="text-[11px] text-[var(--text-tertiary)] leading-relaxed italic opacity-90 border-l border-[var(--border-medium)] pl-3">
                           &ldquo;{typeof idea === 'object' ? idea.text : idea}&rdquo;
                         </div>
                       ))}
                    </div>
                  ) : <span className="text-[10px] opacity-30 italic">Conceptual slate empty.</span>}
               </AnalystCard>
            </div>
          </div>
        )}

        {activeTab === 'synthesis' && (
           <div className="max-w-3xl mx-auto py-12 px-8 bg-[var(--bg-tertiary)]/20 border border-[var(--border-light)] rounded-sm">
              <h4 className="flex items-center gap-3 text-[10px] font-mono font-bold uppercase tracking-[0.4em] text-[var(--text-tertiary)] mb-10 opacity-60">
                <Fingerprint size={14} /> Synthetic Perspective
              </h4>
              <p className="font-serif text-[22px] leading-[1.8] text-[var(--text-primary)] font-light italic opacity-90">
                &ldquo;{a?.reflections || "Cognitive synthesis unavailable for this stream node."}&rdquo;
              </p>
           </div>
        )}

        {activeTab === 'log' && (
          <div className="max-w-4xl mx-auto">
            {upload.transcript ? (
               <div className="space-y-6">
                  {upload.transcript_segments?.map((seg, i) => (
                    <div key={i} className="flex gap-8 group">
                       <span className="text-[8px] font-mono text-[var(--text-tertiary)] opacity-30 w-12 pt-1">{formatTimestamp(seg.start)}</span>
                       <p className="text-[13px] leading-relaxed text-[var(--text-secondary)] opacity-100">{seg.text}</p>
                    </div>
                  ))}
               </div>
            ) : <EmptyState text="Log record empty." />}
          </div>
        )}

        {/* Existing fragments and drafts tabs simplified for density */}
        {activeTab === 'clips' && (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {upload.generated_clips?.map((clip, i) => (
                <div key={i} className="p-4 border border-[var(--border-light)] bg-[var(--bg-secondary)] rounded-sm">
                   <h5 className="text-[11px] font-bold text-[var(--text-primary)] mb-2 line-clamp-1">{clip.title}</h5>
                   <p className="text-[10px] text-[var(--text-tertiary)] opacity-60 italic">&ldquo;{clip.transcript?.slice(0, 100)}...&rdquo;</p>
                </div>
              ))}
              {!upload.generated_clips?.length && <EmptyState text="Zero fragments found." />}
           </div>
        )}

        {activeTab === 'posts' && (
           <div className="max-w-2xl space-y-8">
              {upload.generated_posts?.map((post, i) => (
                <div key={i} className="p-6 border border-[var(--border-light)] bg-[var(--bg-secondary)] rounded-sm">
                   <span className="text-[8px] font-mono opacity-40 uppercase mb-2 block">{post.type}</span>
                   <h5 className="text-[14px] font-bold mb-3">{post.title}</h5>
                   <p className="text-[12px] text-[var(--text-secondary)] font-light leading-relaxed">{post.content}</p>
                </div>
              ))}
              {!upload.generated_posts?.length && <EmptyState text="No drafts." />}
           </div>
        )}
      </div>
    </div>
  )
}

function AnalystCard({ title, icon: Icon, children }: { title: string, icon: any, children: React.ReactNode }) {
  return (
    <div className="p-5 border border-[var(--border-light)] bg-[#060608] rounded-sm">
      <h4 className="flex items-center gap-2 text-[8px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)] mb-4 opacity-40">
        <Icon size={10} /> {title}
      </h4>
      {children}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-12 flex flex-col items-center justify-center opacity-10 border border-dashed border-[var(--border-light)] rounded-sm">
      <p className="text-[8px] font-mono uppercase tracking-[0.4em] text-center">{text}</p>
    </div>
  )
}

function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
