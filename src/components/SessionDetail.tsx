'use client'

import { useState, useEffect } from 'react'
import {
  Brain, Target, FileText, Scissors, Shield, Sparkles, Zap,
  Tag as TagIcon, Lightbulb, HelpCircle, FolderOpen, CheckCircle2,
  TrendingUp, AlertTriangle, Users, BookOpen, MessageCircle, Play,
  CalendarDays, ChevronRight, Edit2
} from 'lucide-react'
import type { VideoUpload, TranscriptWord } from '@/types/database'
import { TranscriptEditor } from '@/components/TranscriptEditor'

import { format } from 'date-fns'

interface SessionDetailProps {
  upload: Partial<VideoUpload> & { analysis: any }
}

export function SessionDetail({ upload }: SessionDetailProps) {
  const [activeTab, setActiveTab] = useState<'analysis' | 'personal' | 'transcript' | 'edit' | 'clips' | 'posts'>('analysis')
  const [transcriptWords, setTranscriptWords] = useState<TranscriptWord[] | null>(null)
  const [loadingWords, setLoadingWords] = useState(false)
  const a = upload.analysis

  // Load word-level transcript when Edit tab is opened
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
    { key: 'personal' as const,    label: 'Personal',     icon: Target },
    { key: 'transcript' as const,  label: 'Transcript',   icon: FileText },
    { key: 'edit' as const,        label: 'Edit',         icon: Edit2 },
    { key: 'clips' as const,       label: 'Clips',        icon: Scissors, count: upload.generated_clips?.length || 0 },
    { key: 'posts' as const,       label: 'Posts',        icon: FileText, count: upload.generated_posts?.length || 0 },
  ]

  return (
    <div className="session-detail">
      {a?.contains_sensitive_content && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-lg bg-red-400/10 border border-red-400/20">
          <Shield size={14} className="text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-400">
            Sensitive content detected and redacted. {a.pii_detected?.length || 0} item(s) flagged.
          </p>
        </div>
      )}

      {/* Tabs Header */}
      <div className="flex gap-1 mb-5 border-b border-[var(--border-light)] pb-px overflow-x-auto no-scrollbar">
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
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon size={13} />
              {tab.label}
              {'count' in tab && (tab as any).count > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[10px]">
                  {(tab as any).count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="tab-content transition-all duration-300">
        {activeTab === 'analysis' && a && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] shadow-sm">
                  <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--accent)] mb-3 flex items-center gap-2">
                    <CalendarDays size={12} /> Timeline Placement
                  </h4>
                  <div className="flex items-baseline gap-2">
                    <p className="text-lg font-light text-[var(--text-primary)] tracking-tight">
                      {upload.recorded_at ? format(new Date(upload.recorded_at), 'MMMM d, yyyy') : 'No date detected'}
                    </p>
                    <p className="text-[10px] text-[var(--text-tertiary)] font-mono">
                      {upload.recorded_at ? format(new Date(upload.recorded_at), 'p') : ''}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-col gap-1.5 border-t border-[var(--border-light)]/30 pt-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${upload.recorded_at ? 'bg-green-400' : 'bg-red-400'}`} />
                      <p className="text-[10px] text-[var(--text-tertiary)] opacity-80 uppercase tracking-wider font-medium">
                        {upload.recorded_at ? 'Metadata Synchronized' : 'Fallback to Upload Date'}
                      </p>
                    </div>
                    {upload.recorded_at && (
                      <p className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-50 overflow-hidden text-ellipsis whitespace-nowrap">
                        Trace: {upload.recorded_at}
                      </p>
                    )}
                  </div>
                </div>

                {upload.meta?.raw_metadata_diagnostic && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] flex items-center gap-2">
                        <FileText size={11} /> Extraction Source
                      </h4>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] font-mono">
                        FFPROBE-JSON
                      </span>
                    </div>
                    <div className="bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl p-4 max-h-60 overflow-y-auto no-scrollbar shadow-inner">
                      <pre className="text-[10px] text-[var(--text-tertiary)] font-mono leading-relaxed whitespace-pre-wrap">
                        {JSON.stringify(upload.meta.raw_metadata_diagnostic, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Summary</h4>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{a.summary}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {a.mood && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] text-[11px]">
                      <span className="text-[var(--text-tertiary)]">Mood:</span>
                      <span className="font-semibold text-[var(--text-primary)]">{a.mood}</span>
                    </span>
                  )}
                  {a.energy_level && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] text-[11px]">
                      <Zap size={10} className="text-[var(--accent)]" />
                      <span className="font-semibold text-[var(--text-primary)] capitalize">{a.energy_level} energy</span>
                    </span>
                  )}
                </div>

                {a.categories?.length > 0 && (
                  <Section icon={TagIcon} title="Categories">
                    <div className="flex flex-wrap gap-1.5">
                      {a.categories.map((cat: any, i: number) => (
                        <span key={i} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-light)]">
                          {cat.name}<span className="ml-1 text-[var(--text-tertiary)] opacity-60">{Math.round(cat.confidence * 100)}%</span>
                        </span>
                      ))}
                    </div>
                  </Section>
                )}

                {a.ideas?.length > 0 && (
                  <Section icon={Lightbulb} title="Ideas" variant="amber">
                    <div className="space-y-2.5">
                      {a.ideas.map((idea: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)] group p-3 rounded-xl bg-amber-400/5 border border-amber-400/10 hover:border-amber-400/30 transition-colors shadow-sm">
                          <Lightbulb size={14} className="text-amber-400 mt-1 flex-shrink-0" />
                          <div>
                            {typeof idea === 'object' ? idea.text : idea}
                            {typeof idea === 'object' && idea.type && (
                              <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-500 border border-amber-400/20 uppercase tracking-wider font-mono">{idea.type}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {a.questions?.length > 0 && (
                  <Section icon={HelpCircle} title="Open Questions" variant="purple">
                    <div className="space-y-3">
                      {a.questions.map((q: string, i: number) => (
                        <div key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-3 p-4 rounded-xl bg-purple-400/5 border border-purple-400/10 shadow-sm italic">
                          <HelpCircle size={14} className="text-purple-400 mt-1 flex-shrink-0" />
                          {q}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>

              <div className="space-y-6">
                {a.projects?.length > 0 && (
                  <Section icon={FolderOpen} title="Projects" variant="blue">
                    <div className="space-y-3">
                      {a.projects.map((p: any, i: number) => (
                        <div key={i} className="border border-blue-400/20 rounded-xl p-4 bg-blue-400/5 shadow-sm hover:border-blue-400/40 transition-colors">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-bold text-[var(--text-primary)]">{p.name}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-blue-400/10 text-blue-400 border border-blue-400/20">{p.status}</span>
                          </div>
                          {p.updates?.length > 0 && (
                            <ul className="space-y-2 mt-2 border-t border-blue-400/10 pt-2 text-[13px]">
                              {p.updates.map((u: string, j: number) => (
                                <li key={j} className="text-[var(--text-secondary)] flex items-start gap-2">
                                  <ChevronRight size={12} className="mt-1 text-blue-400/50 flex-shrink-0" /> 
                                  <span>{u}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {a.action_items?.length > 0 && (
                  <Section icon={CheckCircle2} title="Action Items" variant="emerald">
                    <div className="space-y-2">
                      {a.action_items.map((item: string, i: number) => (
                        <div key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-3 p-3 rounded-xl bg-emerald-400/5 border border-emerald-400/10 shadow-sm group">
                          <CheckCircle2 size={14} className="text-emerald-400 mt-1 flex-shrink-0 group-hover:scale-110 transition-transform" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {a.decisions?.length > 0 && (
                  <Section icon={TrendingUp} title="Decisions" variant="indigo">
                    <div className="space-y-3">
                      {a.decisions.map((d: any, i: number) => (
                        <div key={i} className="p-4 rounded-xl bg-indigo-400/5 border border-indigo-400/10 shadow-sm">
                          <div className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                            {d.decision}
                          </div>
                          {d.reasoning && (
                            <div className="mt-2 pl-3.5 border-l border-indigo-400/20">
                              <p className="text-xs text-[var(--text-tertiary)] italic leading-relaxed">{d.reasoning}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {a.blockers?.length > 0 && (
                  <Section icon={AlertTriangle} title="Blockers" variant="rose">
                    <div className="space-y-2">
                      {a.blockers.map((b: string, i: number) => (
                        <div key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-3 p-3 rounded-xl bg-rose-400/5 border border-rose-400/10 shadow-sm">
                          <AlertTriangle size={14} className="text-rose-400 mt-1 flex-shrink-0 animate-pulse" />
                          {b}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            </div>

            {a.reflections && (
              <div className="bg-[var(--accent)]/[0.03] border border-[var(--accent)]/10 rounded-xl p-5 mt-8 relative overflow-hidden backdrop-blur-sm">
                <div className="absolute top-0 right-0 p-4 opacity-[0.05]">
                  <Sparkles size={48} />
                </div>
                <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--accent)] mb-3 flex items-center gap-2">
                  <Sparkles size={12} /> Neolog's Response
                </h4>
                <p style={{ 
                  fontSize: '14px', 
                  lineHeight: '1.7', 
                  color: 'var(--text-primary)',
                  fontWeight: 400
                }}>
                  {a.reflections}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'personal' && a && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              {a.goals?.length > 0 && (
                <Section icon={Target} title="Goals">
                  <div className="space-y-2.5">
                    {a.goals.map((g: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                        <Target size={14} className="text-blue-400 mt-1 flex-shrink-0" />
                        <div>
                          {g.goal}
                          <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] uppercase">{g.timeframe?.replace('_', ' ')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {a.commitments?.length > 0 && (
                <Section icon={CheckCircle2} title="Commitments">
                  <ul className="space-y-2">
                    {a.commitments.map((c: string, i: number) => (
                      <li key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                         <span className="text-blue-400 font-bold">•</span> {c}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {a.habits?.length > 0 && (
                <Section icon={Zap} title="Habits">
                  <div className="space-y-2.5">
                    {a.habits.map((h: any, i: number) => (
                      <div key={i} className="flex items-center gap-2.5 text-sm text-[var(--text-secondary)] bg-[var(--bg-tertiary)]/30 p-2 rounded-lg">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          h.sentiment === 'positive' ? 'bg-green-400' : h.sentiment === 'negative' ? 'bg-red-400' : 'bg-[var(--text-tertiary)]'
                        }`} />
                        {h.habit}
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </div>

            <div className="space-y-6">
              {a.people_mentioned?.length > 0 && (
                <Section icon={Users} title="People">
                  <div className="space-y-4">
                    {a.people_mentioned.map((p: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-tertiary)] flex-shrink-0">
                          <Users size={14} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--text-primary)]">{p.name}</span>
                            {p.relationship && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] uppercase">{p.relationship}</span>}
                          </div>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">{p.context}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {a.values_expressed?.length > 0 && (
                <Section icon={Shield} title="Values Expressed">
                  <div className="flex flex-wrap gap-1.5">
                    {a.values_expressed.map((v: string, i: number) => (
                      <span key={i} className="px-3 py-1 rounded-lg text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-light)]">{v}</span>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          </div>
        )}

        {activeTab === 'transcript' && (
          <div className="transcript-view">
            {upload.transcript ? (
              <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {upload.transcript_segments && upload.transcript_segments.length > 0 ? (
                  <div className="space-y-3">
                    {upload.transcript_segments.map((seg, i) => (
                      <div key={i} className="flex gap-4 group">
                        <span className="text-[10px] text-[var(--text-tertiary)] font-mono pt-1 flex-shrink-0 w-14 text-right opacity-40 group-hover:opacity-100 transition-opacity">
                          {formatTimestamp(seg.start)}
                        </span>
                        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed group-hover:text-[var(--text-primary)] transition-colors">{seg.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                    {upload.transcript}
                  </p>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-[var(--text-tertiary)]">
                <FileText size={24} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">No transcript available</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'edit' && (
          <div className="min-h-[300px]">
            {loadingWords ? (
              <div className="py-12 text-center text-[var(--text-tertiary)]">
                <p className="text-sm animate-pulse">Loading word-level transcript...</p>
              </div>
            ) : transcriptWords && transcriptWords.length > 0 ? (
              <TranscriptEditor
                uploadId={upload.id!}
                words={transcriptWords}
                onWordsUpdate={setTranscriptWords}
              />
            ) : (
              <div className="py-12 text-center text-[var(--text-tertiary)]">
                <Edit2 size={24} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">No word-level data for this upload</p>
                <p className="text-xs mt-1 opacity-60">Word timestamps are captured on new uploads going forward</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'clips' && (
          <div className="space-y-4">
            {upload.generated_clips && upload.generated_clips.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {upload.generated_clips.map((clip, i) => (
                  <div key={i} className="border border-[var(--border-light)] rounded-xl p-4 bg-[var(--bg-primary)] hover:border-[var(--accent)] transition-all cursor-pointer group shadow-sm">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h5 className="text-[13px] font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">{clip.title}</h5>
                      <span className="text-[10px] text-[var(--text-tertiary)] font-mono flex-shrink-0 bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">
                        {formatTimestamp(clip.start)} – {formatTimestamp(clip.end)}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-3 italic opacity-80">&ldquo;{clip.transcript}&rdquo;</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-[var(--text-tertiary)]">
                <Scissors size={24} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">No clip suggestions available yet</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'posts' && (
          <div className="space-y-4">
            {upload.generated_posts && upload.generated_posts.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {upload.generated_posts.map((post, i) => (
                  <div key={i} className="border border-[var(--border-light)] rounded-xl p-5 bg-[var(--bg-card)] hover:shadow-md transition-shadow relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent)] opacity-20 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-0.5 rounded-[4px] text-[9px] font-mono uppercase tracking-widest bg-[var(--accent)]/10 text-[var(--accent)]">
                        {post.type.replace('_', ' ')}
                      </span>
                    </div>
                    <h5 className="text-sm font-bold text-[var(--text-primary)] mb-2">{post.title}</h5>
                    <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{post.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-[var(--text-tertiary)]">
                <MessageCircle size={24} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">No post suggestions available yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, children, variant = 'accent' }: { icon: any; title: string; children: React.ReactNode; variant?: string }) {
  const colors: Record<string, string> = {
    accent:   'text-[var(--accent)]',
    blue:     'text-blue-400',
    emerald:  'text-emerald-400',
    purple:   'text-purple-400',
    amber:    'text-amber-400',
    rose:     'text-rose-400',
    indigo:   'text-indigo-400',
  }

  return (
    <div className="section-block">
      <h4 className={`text-[10px] font-mono uppercase tracking-widest mb-3 flex items-center gap-2 opacity-80 ${colors[variant] || colors.accent}`}>
        <Icon size={11} /> {title}
      </h4>
      {children}
    </div>
  )
}

function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
