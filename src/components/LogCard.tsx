'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Sparkles, Video, Mic, FileText, ChevronRight } from 'lucide-react'

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
          <div style={{ width: '100%', height: '100%', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
            <img src={displayImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {entry.entry_type === 'session' && (
                <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: 'var(--accent)', color: 'white', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                <Video size={10} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', borderRadius: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
            {emoji}
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
        {hasBody && (
          <p style={{
            fontSize: '12px',
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
            margin: '4px 0 8px 0',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {entry.body}
          </p>
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
            {entry.source_upload_id && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: 'var(--accent)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                DETAILS <ChevronRight size={12} />
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  )

  if (entry.source_upload_id) {
    return (
      <Link href={`/dashboard/uploads?id=${entry.source_upload_id}`} style={{ textDecoration: 'none', display: 'block' }}>
        {content}
      </Link>
    )
  }

  return content
}
