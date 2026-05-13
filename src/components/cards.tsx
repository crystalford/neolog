/**
 * Card components — the heterogeneous Timeline feed cards.
 * One per row type: Vlog, Thread, Post, Clip, Article, Surfaced, ProjectUpdate.
 *
 * Each card matches the prototype design exactly. Topic color is passed as a
 * CSS custom property (--topic) on the root element so the left rule, glow,
 * and accent text all share the same hue.
 */

import { TOPIC, topicColorFor } from '@/lib/design'

// ─── icons (reused) ───────────────────────────────────────────────────────
function VisibilityIcon({ kind }: { kind: 'private' | 'public' }) {
  return (
    <span className="visibility">
      {kind === 'private' ? (
        <svg viewBox="0 0 12 12">
          <rect x="2.5" y="5" width="7" height="5" rx="1" />
          <path d="M4 5 L4 3.5 Q4 1.5 6 1.5 Q8 1.5 8 3.5 L8 5" />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12">
          <path d="M1 6 Q6 1 11 6 Q6 11 1 6 Z" />
          <circle cx="6" cy="6" r="1.5" fill="currentColor" />
        </svg>
      )}
      {kind === 'private' ? 'Private' : 'Public'}
    </span>
  )
}

function PlayMini() {
  return (
    <div className="play-mini">
      <div><svg viewBox="0 0 8 8"><path d="M2 1 L7 4 L2 7 Z" /></svg></div>
    </div>
  )
}

function PlayMid() {
  return (
    <div className="play-cue-mid">
      <div><svg viewBox="0 0 11 11"><path d="M2 1 L9 5.5 L2 10 Z" /></svg></div>
    </div>
  )
}

// ─── card props ───────────────────────────────────────────────────────────
interface TopicStyle {
  '--topic'?: string
  '--topic-glow'?: string
}

function topicVars(topic?: string | null): React.CSSProperties {
  if (!topic) return {}
  // Allow either a TOPIC key, hex string, or seed.
  let color = topic
  if (topic in TOPIC) color = TOPIC[topic as keyof typeof TOPIC]
  else if (!topic.startsWith('#')) color = topicColorFor(topic)
  return { '--topic': color, '--topic-glow': hexToGlow(color) } as React.CSSProperties
}

function hexToGlow(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},0.08)`
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ─── Vlog ─────────────────────────────────────────────────────────────────
export interface VlogCardData {
  id: string
  type: 'vlog'
  recorded_at: string
  recorded_at_source?: 'pre_extracted' | 'mvhd' | 'filename' | 'upload_time_default' | null
  title: string
  thumbnail_url?: string | null
  duration_seconds?: number | null
  file_size_bytes?: number
  mime_type?: string
  thread_count?: number
  clip_count?: number
  transcript_word_count?: number
  visibility?: 'private' | 'public'
  pipeline_status?: string
}

export function VlogCard({ v }: { v: VlogCardData }) {
  const dur = v.duration_seconds
    ? `${Math.floor(v.duration_seconds / 60)}:${String(Math.floor(v.duration_seconds % 60)).padStart(2, '0')}`
    : null
  const sizeMb = v.file_size_bytes ? (v.file_size_bytes / 1_000_000).toFixed(1) : null
  const ext = v.mime_type?.split('/')[1]?.toUpperCase()
  const status = v.pipeline_status && v.pipeline_status !== 'complete'
    ? v.pipeline_status.charAt(0).toUpperCase() + v.pipeline_status.slice(1)
    : v.thread_count !== undefined
      ? `${v.thread_count} threads${v.clip_count ? `, ${v.clip_count} clips` : ''}`
      : 'Processing…'
  // Real recorded date if we have any source other than upload_time_default —
  // otherwise we're showing the upload time as a fallback. Label accordingly.
  const isRealRecorded =
    v.recorded_at_source === 'pre_extracted' ||
    v.recorded_at_source === 'mvhd' ||
    v.recorded_at_source === 'filename'
  const datePrefix = isRealRecorded ? 'Recorded' : 'Uploaded'
  return (
    <a href={`/timeline/${v.id}`} className="tcard vlog has-topic" style={topicVars('#7a7160')}>
      <div className="t-meta">
        <span className="type-tag">Vlog</span>
        <span className="sep">·</span>
        <span className="status">{status}</span>
        <span className="time">{datePrefix} · {timeLabel(v.recorded_at)}</span>
        <VisibilityIcon kind={v.visibility ?? 'private'} />
      </div>
      <div className="vlog-row">
        <div
          className="vlog-thumb"
          style={v.thumbnail_url ? { backgroundImage: `url(${v.thumbnail_url})` } : undefined}
        >
          <PlayMini />
          {dur && <span className="dur">{dur}</span>}
        </div>
        <div className="vlog-info">
          <div className="title">{v.title || 'Untitled vlog'}</div>
          <div className="extracted">
            {v.transcript_word_count ? <><span className="n">{v.transcript_word_count.toLocaleString()}</span> words</> : null}
            {v.transcript_word_count && sizeMb ? ' · ' : null}
            {sizeMb ? `${sizeMb} MB` : null}
            {ext ? ` · ${ext}` : null}
          </div>
        </div>
      </div>
    </a>
  )
}

// ─── Thread ───────────────────────────────────────────────────────────────
export interface ThreadCardData {
  id: string
  type: 'thread'
  created_at: string
  topic?: string
  abstracted_topic?: string
  take: string
  key_quote?: string | null
  strength?: number // 1..5
  visibility?: 'private' | 'public'
  source_vlog_title?: string
  source_timecode?: string
}

export function ThreadCard({ t }: { t: ThreadCardData }) {
  const topic = t.abstracted_topic || t.topic || 'general'
  const strength = Math.max(0, Math.min(5, t.strength ?? 3))
  return (
    <a href={`/thread/${t.id}`} className="tcard thread has-topic" style={topicVars(topic)}>
      <div className="t-meta">
        <span className="type-tag">Thread</span>
        <span className="sep">·</span>
        <span className="status">{topic}</span>
        <span className="time">{timeLabel(t.created_at)}</span>
        <VisibilityIcon kind={t.visibility ?? 'private'} />
      </div>
      <div className="t-headline">{t.take}</div>
      {t.key_quote && <div className="quote">{t.key_quote}</div>}
      <div className="strength-row">
        <span>Strength</span>
        <span className="pips">
          {[0, 1, 2, 3, 4].map(i => (
            <span key={i} className={`pip ${i < strength ? 'on' : ''}`} />
          ))}
        </span>
        {t.source_vlog_title && (
          <span>· From <em>{t.source_vlog_title}</em>{t.source_timecode ? ` · ${t.source_timecode}` : ''}</span>
        )}
      </div>
    </a>
  )
}

// ─── Post ─────────────────────────────────────────────────────────────────
export interface PostCardData {
  id: string
  type: 'post'
  posted_at: string
  topic?: string
  platform?: string
  text: string
  views?: number
  reposts?: number
  replies?: number
}

export function PostCard({ p }: { p: PostCardData }) {
  return (
    <a href={`/post/${p.id}`} className="tcard post published has-topic" style={topicVars(p.topic || 'terra')}>
      <div className="t-meta">
        <span className="type-tag">Post</span>
        <span className="sep">·</span>
        <span className="status">Published to {p.platform || 'X'}</span>
        <span className="time">{timeLabel(p.posted_at)}</span>
        <VisibilityIcon kind="public" />
      </div>
      <div className="post-text">{p.text}</div>
      <div className="engagement">
        {p.views !== undefined && <span className="stat"><span className="n">{p.views}</span> views</span>}
        {p.reposts !== undefined && <span className="stat"><span className="n">{p.reposts}</span> reposts</span>}
        {p.replies !== undefined && <span className="stat"><span className="n">{p.replies}</span> replies</span>}
      </div>
    </a>
  )
}

// ─── Clip ─────────────────────────────────────────────────────────────────
export interface ClipCardData {
  id: string
  type: 'clip'
  created_at: string
  topic?: string
  status: 'candidate' | 'published'
  start_seconds: number
  end_seconds: number
  quote?: string | null
}

export function ClipCard({ c }: { c: ClipCardData }) {
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const dur = c.end_seconds - c.start_seconds
  return (
    <a href={`/clip/${c.id}`} className={`tcard clip has-topic${c.status === 'published' ? ' published' : ''}`} style={topicVars(c.topic || 'sage')}>
      <div className="t-meta">
        <span className="type-tag">Clip</span>
        <span className="sep">·</span>
        <span className="status">{c.status === 'published' ? 'Published to X' : 'Candidate · pending review'}</span>
        <span className="time">{timeLabel(c.created_at)}</span>
      </div>
      <div className="clip-preview">
        <span className="timecode">{fmt(c.start_seconds)} → {fmt(c.end_seconds)}</span>
        <PlayMid />
        <span className="dur-mid">{fmt(dur)}</span>
      </div>
      {c.quote && <div className="quote-line">{c.quote}</div>}
    </a>
  )
}

// ─── Article / Essay ─────────────────────────────────────────────────────
export interface ArticleCardData {
  id: string
  type: 'article'
  created_at: string
  topic?: string
  status: 'drafting' | 'published'
  headline: string
  blurb?: string
  version?: string
  progress: number // 0..1
  word_count?: number
  threads_woven?: number
  bounce_sources?: number
  reads?: number
  read_minutes?: number
}

export function ArticleCard({ a }: { a: ArticleCardData }) {
  return (
    <a href={`/article/${a.id}`} className={`tcard essay has-topic${a.status === 'published' ? ' published' : ''}`} style={topicVars(a.topic || 'terra')}>
      <div className="t-meta">
        <span className="type-tag">Article</span>
        <span className="sep">·</span>
        <span className="status">{a.status === 'published' ? 'Published' : `Drafting${a.version ? ' · ' + a.version : ''}`}</span>
        <span className="time">{timeLabel(a.created_at)}</span>
      </div>
      <div className="t-headline">{a.headline}</div>
      {a.blurb && <div className="essay-blurb">{a.blurb}</div>}
      <div className="essay-progress">
        <div className="track"><div className="fill" style={{ width: `${Math.round(a.progress * 100)}%` }} /></div>
        <span className="pct">{a.status === 'published' ? 'Live' : `${Math.round(a.progress * 100)}%`}</span>
      </div>
      <div className="essay-stats">
        {a.word_count !== undefined && <span><span className="n">{a.word_count.toLocaleString()}</span> words</span>}
        {a.threads_woven !== undefined && <span><span className="n">{a.threads_woven}</span> threads woven</span>}
        {a.bounce_sources !== undefined && <span><span className="n">{a.bounce_sources}</span> bounce sources</span>}
        {a.read_minutes !== undefined && <span><span className="n">{a.read_minutes} min</span> read</span>}
        {a.reads !== undefined && <span><span className="n">{a.reads}</span> reads</span>}
      </div>
    </a>
  )
}

// ─── Surfaced ─────────────────────────────────────────────────────────────
export interface SurfacedCardData {
  id: string
  type: 'surfaced'
  created_at: string
  topic?: string
  kind: 'cluster_ready' | 'adjacent_insight' | 'gap_question' | 'auto_link'
  body: string // HTML allowed (rendered carefully)
  href?: string
}

const SURFACED_LABELS: Record<SurfacedCardData['kind'], string> = {
  cluster_ready: 'Cluster ready',
  adjacent_insight: 'Adjacent insight',
  gap_question: 'Gap question',
  auto_link: 'Auto-link',
}

export function SurfacedCard({ s }: { s: SurfacedCardData }) {
  return (
    <a href={s.href || '#'} className="tcard surfaced has-topic" style={topicVars(s.topic || 'terra')}>
      <div className="t-meta">
        <span className="type-tag">Surfaced</span>
        <span className="sep">·</span>
        <span className="status">{SURFACED_LABELS[s.kind]}</span>
        <span className="time">{timeLabel(s.created_at)}</span>
      </div>
      <div className="surfaced-body">
        <span className="surfaced-ico">
          {s.kind === 'cluster_ready' && (
            <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /><path d="M8 5 L8 8 L10.5 9.5" /></svg>
          )}
          {s.kind === 'adjacent_insight' && (
            <svg viewBox="0 0 16 16"><path d="M8 1 L8 15 M3 6 L8 1 L13 6" /></svg>
          )}
          {s.kind === 'gap_question' && (
            <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /><path d="M8 4 L8 8 L11 9.5" /></svg>
          )}
          {s.kind === 'auto_link' && (
            <svg viewBox="0 0 16 16"><circle cx="5" cy="8" r="2" /><circle cx="11" cy="8" r="2" /><line x1="7" y1="8" x2="9" y2="8" /></svg>
          )}
        </span>
        <div className="surfaced-text" dangerouslySetInnerHTML={{ __html: s.body }} />
      </div>
    </a>
  )
}

// ─── Project update ──────────────────────────────────────────────────────
export interface ProjectUpdateCardData {
  id: string
  type: 'project_update'
  created_at: string
  project_name: string
  topic?: string
  headline: string
  body?: string
  visibility?: 'private' | 'public'
}

export function ProjectUpdateCard({ p }: { p: ProjectUpdateCardData }) {
  return (
    <a href={`/projects/${p.id}`} className="tcard project-update has-topic" style={topicVars(p.topic || 'plum')}>
      <div className="t-meta">
        <span className="type-tag">{p.project_name}</span>
        <span className="sep">·</span>
        <span className="status">Character beat added</span>
        <span className="time">{timeLabel(p.created_at)}</span>
        <VisibilityIcon kind={p.visibility ?? 'private'} />
      </div>
      <div className="t-headline">{p.headline}</div>
      {p.body && <div className="pu-body" dangerouslySetInnerHTML={{ __html: p.body }} />}
    </a>
  )
}

// ─── Union dispatch ──────────────────────────────────────────────────────
export type TimelineCardData =
  | VlogCardData
  | ThreadCardData
  | PostCardData
  | ClipCardData
  | ArticleCardData
  | SurfacedCardData
  | ProjectUpdateCardData

export function TimelineCard({ card }: { card: TimelineCardData }) {
  switch (card.type) {
    case 'vlog': return <VlogCard v={card} />
    case 'thread': return <ThreadCard t={card} />
    case 'post': return <PostCard p={card} />
    case 'clip': return <ClipCard c={card} />
    case 'article': return <ArticleCard a={card} />
    case 'surfaced': return <SurfacedCard s={card} />
    case 'project_update': return <ProjectUpdateCard p={card} />
  }
}
