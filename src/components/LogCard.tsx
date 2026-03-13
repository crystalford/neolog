'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Trash2, Sparkles, Video, Mic, FileText, ChevronRight, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react'
import { SessionDetail } from './SessionDetail'
import type { VideoUpload } from '@/types/database'

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────
export type LogEntry = {
  id: string
  entry_type: string
  title: string
  body?: string | null
  logged_at: string
  software_tags?: string[]
  cost_delta?: number | null
  asset?: { id: string; name: string; category: string; image_url?: string | null } | null
  thumbnail_url?: string | null
  source_upload_id?: string | null
  is_public: boolean
  meta?: Record<string, any>
}

// ──────────────────────────────────────────────────────────────
// Software chip config
// ──────────────────────────────────────────────────────────────
const TOOL_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  claude:       { label: 'Claude',       color: '#C97A3A', icon: '◆' },
  'claude-sonnet': { label: 'Claude Sonnet', color: '#C97A3A', icon: '◆' },
  gpt:          { label: 'GPT-4o',       color: '#10A37F', icon: '◎' },
  'gpt-4o':     { label: 'GPT-4o',       color: '#10A37F', icon: '◎' },
  antigravity:  { label: 'Antigravity',  color: '#7C6AF5', icon: '◇' },
  cursor:       { label: 'Cursor',       color: '#3B82F6', icon: '▷' },
  gemini:       { label: 'Gemini',       color: '#4285F4', icon: '✦' },
  copilot:      { label: 'Copilot',      color: '#6366F1', icon: '⬡' },
}

const ENTRY_EMOJI: Record<string, string> = {
  work:         '🧠',
  food:         '🍽️',
  health:       '💪',
  finance:      '💰',
  asset_update: '🔧',
  social:       '👥',
  learn:        '📚',
  build:        '⚡',
  session:      '🎬',
  capture:      '📝',
}

const TYPE_COLORS: Record<string, string> = {
  work:         '#3B82F6', // Blue
  food:         '#F59E0B', // Amber
  health:       '#EF4444', // Rose
  finance:      '#10B981', // Emerald
  asset_update: '#7C6AF5', // Violet
  social:       '#EC4899', // Pink
  learn:        '#8B5CF6', // Purple
  build:        '#06B6D4', // Cyan
  session:      '#F43F5E', // Rose
  capture:      '#A855F7', // Purple
}

// ──────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────
function SoftwareChip({ tag }: { tag: string }) {
  const key = tag.toLowerCase().replace(/\s+/g, '-')
  const config = TOOL_CONFIG[key] || { label: tag, color: '#6B7280', icon: '·' }
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 8px',
      borderRadius: '4px',
      border: `1px solid ${config.color}40`,
      background: `${config.color}10`,
      color: config.color,
      fontSize: '10px',
      fontWeight: 600,
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.05em',
      whiteSpace: 'nowrap',
    }}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  )
}

function EntryTypeBadge({ type }: { type: string }) {
  const Icon = type === 'session' ? Video : type === 'capture' ? Mic : FileText
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '9px',
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--text-tertiary)',
      opacity: 0.6,
    }}>
      <Icon size={10} />
      {type.replace('_', ' ')}
    </span>
  )
}

// ──────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────
interface LogCardProps {
  entry: LogEntry
  username?: string
  showPrivacyBadge?: boolean
}

export function LogCard({ entry, username, showPrivacyBadge }: LogCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [fullUploadData, setFullUploadData] = useState<VideoUpload | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const emoji = ENTRY_EMOJI[entry.entry_type] || '📌'
  const loggedDate = new Date(entry.logged_at)
  const timeStr = loggedDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const dateStr = loggedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const displayImage = entry.thumbnail_url || entry.asset?.image_url
  const hasBody = entry.body && entry.body.trim().length > 0
  const hasReflections = entry.meta?.reflections

  const content = (
    <article style={{
      position: 'relative',
      padding: '1.25rem',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: entry.source_upload_id ? 'pointer' : 'default',
      display: 'flex',
      gap: '16px',
      background: 'transparent',
      borderLeft: `3px solid ${TYPE_COLORS[entry.entry_type] || 'transparent'}`,
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = 'rgba(124,106,245,0.03)'
      e.currentTarget.style.transform = entry.source_upload_id ? 'translateX(4px)' : 'none'
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'transparent'
      e.currentTarget.style.transform = 'none'
    }}>
      {/* Visual Indicator / Thumbnail */}
      <div style={{ flexShrink: 0, width: '48px', height: '48px', position: 'relative' }}>
        {displayImage ? (
          <div style={{ width: '100%', height: '100%', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-light)', background: 'var(--bg-tertiary)' }}>
            <img src={displayImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {entry.entry_type === 'session' && (
                <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: 'var(--accent)', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', border: '2px solid var(--bg-primary)' }}>
                <Video size={10} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', borderRadius: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', position: 'relative' }}>
            {emoji}
            {entry.entry_type === 'session' && (
                <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: 'var(--accent)', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', border: '2px solid var(--bg-primary)' }}>
                <Video size={10} />
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header: Title + Time */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' }}>
          <h3 style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            fontWeight: 600,
            lineHeight: 1.4,
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            {entry.title}
          </h3>
          <time style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-tertiary)',
            opacity: 0.6,
            whiteSpace: 'nowrap',
            marginTop: '2px',
          }}>
            {dateStr} · {timeStr}
          </time>
        </div>

        {/* Intelligence Context (Energy, Mood) */}
        {(entry.meta?.mood || entry.meta?.energy) && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            {entry.meta.mood && (
              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                {entry.meta.mood}
              </span>
            )}
            {entry.meta.energy && (
              <span style={{ fontSize: '10px', color: 'var(--accent)', background: 'var(--accent-soft)', padding: '1px 6px', borderRadius: '4px' }}>
                {entry.meta.energy} energy
              </span>
            )}
          </div>
        )}

        {/* Body Preview */}
        {hasBody && !isExpanded && (
          <p style={{
            fontSize: '13px',
            lineHeight: '1.6',
            color: 'var(--text-secondary)',
            margin: '6px 0 10px 0',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {entry.body}
          </p>
        )}

        {/* Reflections Snapshot (if not expanded) */}
        {hasReflections && !isExpanded && (
          <div style={{ 
            background: 'linear-gradient(135deg, var(--accent-soft) 0%, rgba(124,106,245,0.05) 100%)', 
            padding: '12px 16px', 
            borderRadius: '12px', 
            border: '1px solid var(--accent-border)',
            marginTop: '12px',
            boxShadow: '0 4px 12px rgba(124,106,245,0.05)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.1 }}>
              <Sparkles size={40} className="text-[var(--accent)]" />
            </div>
            <p style={{ 
              fontSize: '11px', 
              color: 'var(--accent)', 
              fontWeight: 700, 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              marginBottom: '6px',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}>
              <Sparkles size={12} /> Neolog's Perspective
            </p>
            <p style={{ 
              fontSize: '13px', 
              lineHeight: '1.6', 
              color: 'var(--text-primary)',
              margin: 0,
              fontWeight: 450
            }}>
              {entry.meta?.reflections && entry.meta.reflections.length > 150 ? entry.meta.reflections.substring(0, 147) + '...' : entry.meta?.reflections}
            </p>
          </div>
        )}


        {/* Footer Meta */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <EntryTypeBadge type={entry.entry_type} />
            {entry.software_tags?.map(tag => <SoftwareChip key={tag} tag={tag} />)}
          </div>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {showPrivacyBadge && !entry.is_public && (
              <span style={{ fontSize: '9px', color: '#F87171', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.05em' }}>
                PRIVATE
              </span>
            )}
            <button
               disabled={isDeleting}
               onClick={async (e) => {
                 e.preventDefault()
                 e.stopPropagation()
                 if (!confirm('Delete this log entry?')) return
                 setIsDeleting(true)
                 try {
                   const res = await fetch(`/api/log-entries/${entry.id}`, { method: 'DELETE' })
                   if (res.ok) {
                     window.location.reload() // Simple for now
                   }
                 } catch (err) {
                   console.error('Delete error:', err)
                 } finally {
                   setIsDeleting(false)
                 }
               }}
               style={{ 
                 padding: '4px', 
                 opacity: 0.3, 
                 cursor: 'pointer', 
                 color: 'var(--text-tertiary)',
                 border: 'none',
                 background: 'none',
                 transition: 'opacity 0.2s'
               }}
               onMouseEnter={e => e.currentTarget.style.opacity = '1'}
               onMouseLeave={e => e.currentTarget.style.opacity = '0.3'}
            >
              {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} className="hover:text-red-400" />}
            </button>
            {(entry.source_upload_id || entry.meta) && (
              <span 
                onClick={async (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  
                  if (isExpanded) {
                    setIsExpanded(false)
                    return
                  }

                  setIsExpanded(true)
                  if (!fullUploadData && entry.source_upload_id) {
                    setIsLoading(true)
                    try {
                      const res = await fetch(`/api/video-upload/${entry.source_upload_id}`)
                      if (res.ok) {
                        const data = await res.json()
                        setFullUploadData(data.upload)
                      } else if (res.status === 404) {
                        // Source deleted, but we have meta
                        console.warn('Source upload not found, using meta from entry.')
                      }
                    } catch (err) {
                      console.error('Failed to fetch upload details:', err)
                    } finally {
                      setIsLoading(false)
                    }
                  }
                }}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px', 
                  fontSize: '10px', 
                  color: 'var(--accent)', 
                  fontWeight: 700, 
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: 'var(--accent-soft)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-soft-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--accent-soft)'}
              >
                {isExpanded ? (
                  <>COLLAPSE <ChevronUp size={12} /></>
                ) : (
                  <>DETAILS <ChevronRight size={12} /></>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-light)', paddingTop: '20px' }}>
            {isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
              </div>
            ) : (fullUploadData || entry.meta) ? (
              <div>
                {!fullUploadData && entry.source_upload_id && (
                  <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-lg bg-orange-400/10 border border-orange-400/20 text-[10px] text-orange-400 uppercase tracking-widest font-mono">
                    <AlertCircle size={12} /> Source video file has been removed · Analysis Snapshot
                  </div>
                )}
                <SessionDetail 
                  upload={fullUploadData || ({ 
                     id: entry.source_upload_id || entry.id,
                     file_name: entry.title,
                     recorded_at: entry.logged_at,
                     analysis: entry.meta,
                     mime_type: 'video/mp4',
                     thumbnail_url: entry.thumbnail_url
                  } as any)} 
                />
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>Failed to load details.</p>
            )}
          </div>
        )}
      </div>
    </article>
  )

  return (
    <div style={{ textDecoration: 'none', display: 'block', marginBottom: '8px' }}>
      {content}
    </div>
  )
}
