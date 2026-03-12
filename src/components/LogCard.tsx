'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

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
  meta?: Record<string, unknown>
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
  notion:       { label: 'Notion',       color: '#FFFFFF', icon: 'N' },
  figma:        { label: 'Figma',        color: '#F24E1E', icon: '✦' },
  xcode:        { label: 'Xcode',        color: '#1672EC', icon: '⌘' },
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
  session:      '🎙️',
  capture:      '📝',
  vehicle:      '🚗',
  hardware:     '💻',
  software:     '💿',
  property:     '🏠',
  gear:         '🎒',
}

// ──────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────
function SoftwareChip({ tag }: { tag: string }) {
  const key = tag.toLowerCase().replace(/\s+/g, '-')
  const config = TOOL_CONFIG[key] || { label: tag, color: '#6B7280', icon: '·' }
  return (
    <span
      style={{
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
      }}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  )
}

function CostBadge({ amount }: { amount: number }) {
  const isNeg = amount < 0
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.abs(amount))
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 7px',
        borderRadius: '4px',
        background: isNeg ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
        border: isNeg ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(34,197,94,0.25)',
        color: isNeg ? '#F87171' : '#4ADE80',
        fontSize: '11px',
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {isNeg ? '−' : '+'}{formatted}
    </span>
  )
}

function EntryTypeBadge({ type }: { type: string }) {
  return (
    <span
      style={{
        fontSize: '9px',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--text-tertiary)',
        opacity: 0.6,
      }}
    >
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
  const timeAgo = formatDistanceToNow(loggedDate, { addSuffix: true })
  const absoluteDate = loggedDate.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
  const time = loggedDate.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  const hasSoftwareTags = entry.software_tags && entry.software_tags.length > 0
  const hasCost = entry.cost_delta !== null && entry.cost_delta !== undefined
  const hasAsset = !!entry.asset
  const hasBody = entry.body && entry.body.trim().length > 0
  const displayImage = entry.thumbnail_url || entry.asset?.image_url

  // Specific icon overrides based on title or asset category
  let displayEmoji = emoji
  if (entry.asset?.category === 'vehicle') displayEmoji = ENTRY_EMOJI.vehicle
  if (entry.asset?.category === 'hardware') displayEmoji = ENTRY_EMOJI.hardware
  if (entry.title.toLowerCase().includes('camry')) displayEmoji = ENTRY_EMOJI.vehicle

  return (
    <article
      style={{
        position: 'relative',
        padding: '1.25rem',
        borderBottom: '1px solid var(--border-light)',
        transition: 'background 0.15s',
        cursor: 'default',
        display: 'flex',
        gap: '16px',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(124,106,245,0.03)'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      {/* Thumbnail / Image if present */}
      {displayImage && (
        <div style={{ flexShrink: 0, width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
          <img src={displayImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '6px' }}>
          {/* Emoji type indicator */}
          {!displayImage && (
            <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px', lineHeight: 1 }}>
              {displayEmoji}
            </span>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title + timestamp */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                fontWeight: 600,
                letterSpacing: '0.02em',
                color: 'var(--text-primary)',
                lineHeight: 1.35,
              }}
            >
              {entry.title}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
              <time
                dateTime={entry.logged_at}
                title={loggedDate.toISOString()}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--text-tertiary)',
                  letterSpacing: '0.06em',
                  opacity: 0.7,
                  whiteSpace: 'nowrap',
                }}
              >
                {absoluteDate} · {time}
              </time>
            </div>
          </div>

          {/* Body text */}
          {hasBody && (
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
                marginTop: '6px',
              }}
            >
              {entry.body}
            </p>
          )}

          {/* Neolog's Reflection */}
          {entry.meta?.reflections && (
            <div style={{
              marginTop: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'rgba(124,106,245,0.05)',
              borderLeft: '2px solid var(--accent)',
              fontSize: '12px',
              lineHeight: 1.5,
              color: 'var(--text-primary)',
              fontStyle: 'italic',
            }}>
              {entry.meta.reflections as string}
            </div>
          )}

          {/* Meta row: software tags, cost, asset */}
          {(hasSoftwareTags || hasCost || hasAsset) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px', alignItems: 'center' }}>
              {hasAsset && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--text-tertiary)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-light)',
                    padding: '2px 7px',
                    borderRadius: '4px',
                  }}
                >
                  {ENTRY_EMOJI.asset_update} {entry.asset!.name}
                </span>
              )}
              {hasCost && <CostBadge amount={entry.cost_delta!} />}
              {hasSoftwareTags && entry.software_tags!.map((tag) => (
                <SoftwareChip key={tag} tag={tag} />
              ))}
            </div>
          )}

          {/* Footer: type + source link */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
            <EntryTypeBadge type={entry.entry_type} />
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {showPrivacyBadge && !entry.is_public && (
                <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', opacity: 0.5 }}>
                  PRIVATE
                </span>
              )}
              {entry.source_upload_id && username && (
                <Link
                  href={`/dashboard/uploads/${entry.source_upload_id}`}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--text-tertiary)',
                    opacity: 0.5,
                    textDecoration: 'none',
                    letterSpacing: '0.06em',
                  }}
                >
                  SOURCE →
                </Link>
              )}
            </div>
          </div>
          </div>
        </div>
      </div>
    </article>
  )
}
