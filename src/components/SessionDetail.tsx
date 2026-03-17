'use client'

import { useState, useEffect } from 'react'
import {
  Sparkles, Scissors, MessageCircle, Terminal,
  Lightbulb, FolderOpen, Activity, Target, Edit2, Share2,
  Fingerprint, Braces
} from 'lucide-react'
import type { VideoUpload, TranscriptWord } from '@/types/database'

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
    { key: 'intel' as const,     label: 'Intel',     icon: Braces },
    { key: 'synthesis' as const, label: 'Synthesis', icon: Sparkles },
    { key: 'log' as const,       label: 'Raw',       icon: Terminal },
    { key: 'clips' as const,     label: 'Fragments', icon: Scissors, count: upload.generated_clips?.length || 0 },
    { key: 'posts' as const,     label: 'Posts',     icon: MessageCircle, count: upload.generated_posts?.length || 0 },
  ]

  return (
    <div className="session-detail-v6">
      {/* Tab Nav */}
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
              {tab.count !== undefined && tab.count > 0 && (
                <span className="text-[8px] opacity-40">({tab.count})</span>
              )}
              {activeTab === tab.key && (
                <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[var(--text-primary)]" />
              )}
            </button>
          )
        })}
      </div>

      <div className="tab-content">

        {/* ── INTEL ─────────────────────────────────────────────────────── */}
        {activeTab === 'intel' && a && (
          <div className="space-y-4 max-w-3xl">

            {/* 1. Narrative Core */}
            {a.summary && (
              <div className="p-10 border border-[var(--border-light)] rounded-lg">
                <h4 className="flex items-center gap-2 text-[9px] font-mono font-black uppercase tracking-widest text-[var(--text-tertiary)] mb-6 opacity-40">
                  <Target size={12} /> Narrative Core
                </h4>
                <p className="text-[17px] leading-relaxed text-[var(--text-primary)] font-light tracking-wide">
                  {a.summary}
                </p>
              </div>
            )}

            {/* 2. Rewrite — only if the AI produced one */}
            {a.rewrite && (
              <div className="p-10 border border-[var(--border-light)] rounded-lg">
                <h4 className="flex items-center gap-2 text-[9px] font-mono font-black uppercase tracking-widest text-[var(--text-tertiary)] mb-6 opacity-40">
                  <Edit2 size={12} /> Articulated
                </h4>
                <p className="text-[17px] leading-relaxed text-[var(--text-secondary)] font-light tracking-wide italic">
                  {a.rewrite}
                </p>
              </div>
            )}

            {/* 3. Projects — only if any */}
            {a.projects?.length > 0 && (
              <div className="p-10 border border-[var(--border-light)] rounded-lg">
                <h4 className="flex items-center gap-2 text-[9px] font-mono font-black uppercase tracking-widest text-blue-400 mb-6 opacity-60">
                  <FolderOpen size={12} /> Projects
                </h4>
                <div className="space-y-6">
                  {a.projects.map((p: any, i: number) => (
                    <div key={i}>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[14px] font-bold text-[var(--text-primary)]">{p.name}</span>
                        {p.status && (
                          <span className="text-[8px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] opacity-40 border border-[var(--border-light)] px-2 py-0.5 rounded">
                            {p.status}
                          </span>
                        )}
                      </div>
                      {p.framing && (
                        <p className="text-[13px] text-[var(--text-secondary)] opacity-60 leading-relaxed mb-2">{p.framing}</p>
                      )}
                      {p.updates?.map((u: string, j: number) => (
                        <p key={j} className="text-[12px] text-[var(--text-tertiary)] opacity-50 leading-relaxed">• {u}</p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Ideas — only if any */}
            {a.ideas?.length > 0 && (
              <div className="p-10 border border-[var(--border-light)] rounded-lg">
                <h4 className="flex items-center gap-2 text-[9px] font-mono font-black uppercase tracking-widest text-purple-400 mb-6 opacity-60">
                  <Lightbulb size={12} /> Ideas
                </h4>
                <div className="space-y-4">
                  {a.ideas.map((idea: any, i: number) => (
                    <p key={i} className="text-[14px] text-[var(--text-secondary)] leading-relaxed italic opacity-80">
                      &ldquo;{typeof idea === 'object' ? idea.text : idea}&rdquo;
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Decisions — only if any */}
            {a.decisions?.length > 0 && (
              <div className="p-10 border border-[var(--border-light)] rounded-lg">
                <h4 className="flex items-center gap-2 text-[9px] font-mono font-black uppercase tracking-widest text-emerald-400 mb-6 opacity-60">
                  <Activity size={12} /> Decisions
                </h4>
                <div className="space-y-5">
                  {a.decisions.map((d: any, i: number) => (
                    <div key={i}>
                      <p className="text-[14px] font-semibold text-[var(--text-primary)] leading-snug mb-1">
                        {typeof d === 'object' ? d.decision : d}
                      </p>
                      {d.reasoning && (
                        <p className="text-[12px] text-[var(--text-tertiary)] opacity-50 leading-relaxed">{d.reasoning}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── SYNTHESIS ─────────────────────────────────────────────────── */}
        {activeTab === 'synthesis' && (
          <div className="py-20 px-10 border border-[var(--border-light)] rounded-xl">
            <h4 className="flex items-center gap-3 text-[10px] font-mono font-black uppercase tracking-[0.4em] text-[var(--text-tertiary)] mb-10 opacity-30">
              <Fingerprint size={14} /> Synthetic Perspective
            </h4>
            <p className="text-[18px] leading-[1.8] text-[var(--text-secondary)] font-normal">
              {a?.reflections || 'Synthesis currently offline for this node.'}
            </p>
          </div>
        )}

        {/* ── RAW ───────────────────────────────────────────────────────── */}
        {activeTab === 'log' && (
          <div className="px-10">
            {upload.transcript ? (
              <div className="space-y-8">
                {upload.transcript_segments?.map((seg, i) => (
                  <div key={i} className="flex gap-10 group">
                    <span className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-30 w-16 pt-1 font-bold flex-shrink-0">
                      {formatTimestamp(seg.start)}
                    </span>
                    <p className="text-[15px] leading-relaxed text-[var(--text-secondary)] font-light">{seg.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="No transcript available." />
            )}
          </div>
        )}

        {/* ── FRAGMENTS ─────────────────────────────────────────────────── */}
        {activeTab === 'clips' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upload.generated_clips?.map((clip, i) => (
              <div key={i} className="p-6 border border-[var(--border-light)] bg-[var(--bg-secondary)] rounded-lg">
                <h5 className="text-[12px] font-bold text-[var(--text-primary)] mb-3 leading-snug">{clip.title}</h5>
                <p className="text-[11px] text-[var(--text-tertiary)] opacity-60 italic leading-relaxed">
                  &ldquo;{clip.transcript}&rdquo;
                </p>
              </div>
            ))}
            {!upload.generated_clips?.length && <EmptyState text="No fragments extracted." />}
          </div>
        )}

        {/* ── POSTS ─────────────────────────────────────────────────────── */}
        {activeTab === 'posts' && (
          <div className="max-w-2xl space-y-8">
            {upload.generated_posts?.map((post, i) => (
              <div key={i} className="p-10 border border-[var(--border-light)] bg-[var(--bg-secondary)] rounded-lg">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-[9px] font-mono opacity-30 uppercase tracking-[0.3em]">{post.type}</span>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.content)}`, '_blank')
                    }}
                    className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] opacity-40 hover:opacity-100 transition-opacity"
                  >
                    <Share2 size={11} /> Share to X
                  </button>
                </div>
                <p className="text-[15px] text-[var(--text-secondary)] font-light leading-[1.8]">{post.content}</p>
              </div>
            ))}
            {!upload.generated_posts?.length && <EmptyState text="No posts." />}
          </div>
        )}

      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-24 flex flex-col items-center justify-center opacity-10 border border-dashed border-[var(--border-light)] rounded-lg col-span-full">
      <p className="text-[10px] font-mono uppercase tracking-[0.6em] text-center font-black">{text}</p>
    </div>
  )
}

function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
