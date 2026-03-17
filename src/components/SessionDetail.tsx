'use client'

import { useState, useEffect } from 'react'
import {
  Brain, Target, FileText, Scissors, Shield, Sparkles, Zap,
  Tag as TagIcon, Lightbulb, HelpCircle, FolderOpen, CheckCircle2,
  TrendingUp, AlertTriangle, Users, BookOpen, MessageCircle, Play,
  CalendarDays, ChevronRight, Edit2, Quote, Activity, Compass, Fingerprint
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
    { key: 'analysis' as const,    label: 'Intelligence', icon: Brain },
    { key: 'transcript' as const,  label: 'Transcript',   icon: FileText },
    { key: 'edit' as const,        label: 'Edit',         icon: Edit2 },
    { key: 'clips' as const,       label: 'Clips',        icon: Scissors, count: upload.generated_clips?.length || 0 },
    { key: 'posts' as const,       label: 'Posts',        icon: FileText, count: upload.generated_posts?.length || 0 },
  ]

  return (
    <div className="session-detail animate-in fade-in duration-700">
      {a?.contains_sensitive_content && (
        <div className="flex items-center gap-3 px-6 py-4 mb-8 rounded-2xl bg-red-500/5 border border-red-500/10 backdrop-blur-md">
          <Shield size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-[11px] font-mono uppercase tracking-widest text-red-400">
            Sensitive content detected and redacted. {a.pii_detected?.length || 0} items flagged.
          </p>
        </div>
      )}

      {/* Tabs Header - Premium Minimal */}
      <div className="flex gap-8 mb-10 border-b border-[var(--border-light)] pb-px overflow-x-auto no-scrollbar">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setActiveTab(tab.key)
              }}
              className={`flex items-center gap-2.5 px-1 py-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-all relative whitespace-nowrap ${
                activeTab === tab.key
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] opacity-60 hover:opacity-100'
              }`}
            >
              <Icon size={14} className={activeTab === tab.key ? 'animate-pulse' : ''} />
              {tab.label}
              {'count' in tab && (tab as any).count > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-[9px]">
                  {(tab as any).count}
                </span>
              )}
              {activeTab === tab.key && (
                <div className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-[var(--accent)] shadow-[0_0_10px_rgba(124,106,245,0.5)]" />
              )}
            </button>
          )
        })}
      </div>

      <div className="tab-content">
        {activeTab === 'analysis' && a && (
          <div className="space-y-12">
            {/* Top Grid: Recap & Core Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Narrative Summary */}
              <div className="lg:col-span-7 space-y-8">
                <div>
                   <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--accent)] mb-6 opacity-70">
                     <Quote size={12} /> Narrative Core
                   </h4>
                   <p className="font-serif text-2xl leading-relaxed text-[var(--text-primary)] font-medium tracking-tight">
                     {a.summary}
                   </p>
                </div>

                {/* Categories & Topics */}
                <div className="flex flex-wrap gap-2 pt-4">
                  {a.categories?.map((cat: any, i: number) => (
                    <span key={i} className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-light)] hover:border-[var(--accent)]/30 transition-colors cursor-default">
                      {cat.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* State Metadata */}
              <div className="lg:col-span-5 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 rounded-3xl bg-[var(--bg-tertiary)]/30 border border-[var(--border-light)] backdrop-blur-sm">
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-4 flex items-center gap-2">
                       <Activity size={12} /> Mood
                    </p>
                    <p className="text-lg font-medium text-[var(--text-primary)] capitalize tracking-tight">
                      {a.mood || 'Reflective'}
                    </p>
                  </div>
                  <div className="p-5 rounded-3xl bg-[var(--bg-tertiary)]/30 border border-[var(--border-light)] backdrop-blur-sm">
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-4 flex items-center gap-2">
                       <Zap size={12} /> Energy
                    </p>
                    <p className="text-lg font-medium text-[var(--text-primary)] capitalize tracking-tight">
                      {a.energy_level || 'Medium'}
                    </p>
                  </div>
                </div>

                <div className="p-6 rounded-3xl bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <h4 className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-4 flex items-center gap-2">
                    <CalendarDays size={12} /> Temporal Marker
                  </h4>
                  <div className="flex items-baseline gap-2 mb-2">
                    <p className="text-xl font-light text-[var(--text-primary)]">
                      {upload.recorded_at ? format(new Date(upload.recorded_at), 'MMMM d, yyyy') : 'Live Ingestion'}
                    </p>
                    <p className="text-[11px] font-mono text-[var(--text-tertiary)]">
                      {upload.recorded_at ? format(new Date(upload.recorded_at), 'HH:mm') : ''}
                    </p>
                  </div>
                  <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--accent)] opacity-60">
                    Source: {upload.recorded_at ? 'Device Metadata' : 'System Timestamp'}
                  </p>
                </div>
              </div>
            </div>

            {/* Reflections Section - High Impact */}
            {a.reflections && (
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent)]/10 via-transparent to-transparent rounded-3xl blur-2xl opacity-20" />
                <div className="relative p-10 rounded-[2.5rem] bg-[#0d0d15]/80 border border-[var(--accent)]/10 backdrop-blur-xl group-hover:border-[var(--accent)]/30 transition-all duration-700">
                  <div className="absolute top-8 right-10 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Sparkles size={64} className="text-[var(--accent)]" />
                  </div>
                  <h4 className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--accent)] mb-8">
                     <Fingerprint size={16} /> Synthetic Perspective
                  </h4>
                  <p className="text-xl leading-relaxed text-[var(--text-primary)] font-light italic tracking-tight opacity-90">
                    &ldquo;{a.reflections}&rdquo;
                  </p>
                </div>
              </div>
            )}

            {/* Combined Strategic Intelligence */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pt-8 border-t border-[var(--border-light)]">
              {/* Strategic Entities (Projects, Decisions, Action Items) */}
              <div className="space-y-10">
                {a.projects?.length > 0 && (
                  <InsightSection icon={FolderOpen} title="Domain: Projects">
                    <div className="space-y-4">
                      {a.projects.map((p: any, i: number) => (
                        <div key={i} className="group/item">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-semibold text-[var(--text-primary)]">{p.name}</span>
                            <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-[var(--bg-tertiary)] border border-[var(--border-light)] text-[var(--text-tertiary)]">{p.status}</span>
                          </div>
                          {p.updates?.length > 0 && (
                            <p className="text-xs text-[var(--text-tertiary)] leading-relaxed line-clamp-2 italic">{p.updates[0]}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </InsightSection>
                )}

                {a.decisions?.length > 0 && (
                  <InsightSection icon={TrendingUp} title="Strategic: Decisions">
                    <div className="space-y-4">
                      {a.decisions.map((d: any, i: number) => (
                        <div key={i} className="pl-3 border-l-2 border-[var(--accent)]/30">
                          <p className="text-sm text-[var(--text-secondary)] font-medium mb-1">{d.decision}</p>
                          {d.reasoning && <p className="text-[11px] text-[var(--text-tertiary)] italic">{d.reasoning}</p>}
                        </div>
                      ))}
                    </div>
                  </InsightSection>
                )}
              </div>

              {/* Creative & Ideational */}
              <div className="space-y-10">
                {a.ideas?.length > 0 && (
                   <InsightSection icon={Lightbulb} title="Conceptual: Ideas">
                     <div className="space-y-4">
                       {a.ideas.map((idea: any, i: number) => (
                         <div key={i} className="p-4 rounded-2xl bg-[var(--bg-tertiary)]/20 border border-[var(--border-light)] hover:bg-[var(--bg-tertiary)]/40 transition-all">
                           <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                             {typeof idea === 'object' ? idea.text : idea}
                           </p>
                         </div>
                       ))}
                     </div>
                   </InsightSection>
                )}
                
                {a.questions?.length > 0 && (
                  <InsightSection icon={HelpCircle} title="Inquiry: Open Questions">
                    <div className="space-y-4 opacity-70">
                      {a.questions.map((q: string, i: number) => (
                        <p key={i} className="text-sm text-[var(--text-secondary)] italic border-b border-[var(--border-light)] pb-2 last:border-0">
                          {q}
                        </p>
                      ))}
                    </div>
                  </InsightSection>
                )}
              </div>

              {/* Action & Accountability */}
              <div className="space-y-10">
                {a.action_items?.length > 0 && (
                  <InsightSection icon={CheckCircle2} title="Tactical: Action Items">
                    <div className="space-y-3">
                      {a.action_items.map((item: string, i: number) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-2xl bg-[var(--accent-softer)] border border-[var(--accent)]/5 group/ai">
                          <CheckCircle2 size={14} className="text-[var(--accent)] mt-0.5 flex-shrink-0 opacity-40 group-hover/ai:opacity-100 transition-opacity" />
                          <span className="text-sm text-[var(--text-secondary)]">{item}</span>
                        </div>
                      ))}
                    </div>
                  </InsightSection>
                )}

                {a.goals?.length > 0 && (
                  <InsightSection icon={Target} title="Vision: Goals">
                    <div className="space-y-3">
                       {a.goals.map((g: any, i: number) => (
                         <div key={i} className="text-sm text-[var(--text-secondary)]">
                            <span className="font-semibold text-[var(--text-primary)]">• {g.goal}</span>
                            <span className="ml-2 text-[9px] font-mono text-[var(--text-tertiary)] opacity-60 uppercase">{g.timeframe}</span>
                         </div>
                       ))}
                    </div>
                  </InsightSection>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Other tabs with minimal styles */}
        {activeTab === 'transcript' && (
          <div className="py-10">
            {upload.transcript ? (
              <div className="max-h-[600px] overflow-y-auto pr-6 custom-scrollbar space-y-8">
                {upload.transcript_segments && upload.transcript_segments.length > 0 ? (
                  upload.transcript_segments.map((seg, i) => (
                    <div key={i} className="flex gap-10 group">
                      <span className="text-[10px] text-[var(--text-tertiary)] font-mono pt-1.5 flex-shrink-0 w-16 text-right opacity-30 group-hover:opacity-100 transition-opacity">
                        {formatTimestamp(seg.start)}
                      </span>
                      <p className="text-base text-[var(--text-secondary)] leading-loose group-hover:text-[var(--text-primary)] transition-colors duration-500 font-light max-w-2xl">{seg.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-base text-[var(--text-secondary)] leading-loose font-light max-w-2xl whitespace-pre-wrap px-10">
                    {upload.transcript}
                  </p>
                )}
              </div>
            ) : (
              <div className="py-24 text-center opacity-30">
                <FileText size={32} className="mx-auto mb-4" />
                <p className="text-sm uppercase tracking-widest font-mono">End of line</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'edit' && (
          <div className="min-h-[400px] py-8">
            {loadingWords ? (
              <div className="py-24 text-center">
                <p className="text-sm animate-pulse font-mono uppercase tracking-widest opacity-40">Synthesizing word-level data...</p>
              </div>
            ) : transcriptWords && transcriptWords.length > 0 ? (
              <TranscriptEditor
                uploadId={upload.id!}
                words={transcriptWords}
                onWordsUpdate={setTranscriptWords}
              />
            ) : (
              <div className="py-24 text-center opacity-30">
                <Edit2 size={32} className="mx-auto mb-4" />
                <p className="text-sm uppercase tracking-widest font-mono">No granular metadata available</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'clips' && (
          <div className="py-10 pb-20">
            {upload.generated_clips && upload.generated_clips.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {upload.generated_clips.map((clip, i) => (
                  <div key={i} className="group/clip p-6 rounded-3xl bg-[var(--bg-tertiary)]/30 border border-[var(--border-light)] hover:border-[var(--accent)] transition-all duration-500 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent opacity-0 group-hover/clip:opacity-100 transition-opacity" />
                    <div className="flex items-start justify-between mb-4 relative z-10">
                      <h5 className="text-sm font-bold text-[var(--text-primary)] group-hover/clip:text-[var(--accent)] transition-colors">{clip.title}</h5>
                      <span className="text-[9px] text-[var(--text-tertiary)] font-mono bg-[#000]/40 px-2 py-0.5 rounded-full">
                        {formatTimestamp(clip.start)}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed italic opacity-70 group-hover/clip:opacity-100 transition-opacity">&ldquo;{clip.transcript}&rdquo;</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-24 text-center opacity-30">
                <Scissors size={32} className="mx-auto mb-4" />
                <p className="text-sm uppercase tracking-widest font-mono">No fragments available</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'posts' && (
          <div className="py-10 pb-20">
            {upload.generated_posts && upload.generated_posts.length > 0 ? (
              <div className="grid grid-cols-1 gap-8 max-w-3xl">
                {upload.generated_posts.map((post, i) => (
                  <div key={i} className="relative group/post">
                    <div className="absolute -left-4 top-0 bottom-0 w-0.5 bg-[var(--accent)] opacity-20 group-hover/post:opacity-100 transition-opacity" />
                    <div className="flex items-center gap-3 mb-3">
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-widest bg-[var(--accent-soft)] text-[var(--accent)]">
                        {post.type}
                      </span>
                    </div>
                    <h5 className="text-lg font-bold text-[var(--text-primary)] mb-4">{post.title}</h5>
                    <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed font-light">{post.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-24 text-center opacity-30">
                <MessageCircle size={32} className="mx-auto mb-4" />
                <p className="text-sm uppercase tracking-widest font-mono">No drafts generated</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function InsightSection({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <h4 className="flex items-center gap-2.5 text-[9px] font-bold uppercase tracking-[0.3em] text-[var(--text-secondary)] opacity-50">
        <Icon size={12} className="text-[var(--accent)] opacity-80" /> {title}
      </h4>
      <div className="pl-1">
        {children}
      </div>
    </div>
  )
}

function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
