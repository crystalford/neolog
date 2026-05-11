/**
 * Timeline — the heart of Neolog v2.
 *
 * Per spec §4.5.1: single chronological feed of heterogeneous cards, sorted
 * by `recorded_at`. Filter via the pill row at the top. Each card type has
 * its own interior; this MVP renders Vlog cards (the most common type) and
 * a Surfaced placeholder. Thread, Post, Clip, Article, B-roll, Attachment,
 * Project-update cards land in subsequent commits as those tables get
 * populated by the extraction passes.
 *
 * Reads from /api/v2/vlogs (D1-backed) — not the legacy /api/video-upload.
 * The legacy /dashboard/timeline route continues to render the old
 * Supabase-backed feed during cutover.
 */

'use client'
export const runtime = 'edge'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { INK, BONE, TOPIC, STATE, FONT_BODY, FONT_MONO, topicColorFor } from '@/lib/design'

type CardFilter = 'all' | 'vlogs' | 'threads' | 'posts' | 'clips' | 'articles' | 'broll' | 'attachments' | 'surfaced'

interface Vlog {
  id: string
  original_filename: string
  file_size_bytes: number
  mime_type: string
  duration_seconds: number | null
  recorded_at: string | null
  recorded_at_source: string | null
  uploaded_at: string
  thumbnail_url: string | null
  pipeline_status: string
  pipeline_error: string | null
  visibility: string
  has_transcript: number
  created_at: string
  updated_at: string
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDuration(secs: number | null) {
  if (!secs || secs <= 0) return null
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function dayLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const days = Math.floor((now.getTime() - d.getTime()) / (86400 * 1000))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) {
    return d.toLocaleDateString('en-US', { weekday: 'long' })
  }
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function dayKey(iso: string) {
  return iso.slice(0, 10) // YYYY-MM-DD
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const [vlogs, setVlogs] = useState<Vlog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<CardFilter>('all')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/v2/vlogs?limit=200')
        if (!res.ok) throw new Error(`fetch vlogs: HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setVlogs(data.vlogs || [])
          setLoading(false)
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load')
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Group vlogs by day for sticky-header sections
  const groupedByDay = useMemo(() => {
    const sortedVlogs = [...vlogs].sort((a, b) => {
      const aTime = new Date(a.recorded_at || a.created_at).getTime()
      const bTime = new Date(b.recorded_at || b.created_at).getTime()
      return bTime - aTime
    })
    const groups: { day: string; iso: string; cards: Vlog[] }[] = []
    for (const v of sortedVlogs) {
      const iso = v.recorded_at || v.created_at
      const key = dayKey(iso)
      const existing = groups.find(g => dayKey(g.iso) === key)
      if (existing) existing.cards.push(v)
      else groups.push({ day: dayLabel(iso), iso, cards: [v] })
    }
    return groups
  }, [vlogs])

  return (
    <div style={{
      minHeight: '100vh',
      background: INK.bg,
      color: BONE.bone,
      fontFamily: FONT_BODY,
      fontSize: 14,
      lineHeight: 1.5,
      WebkitFontSmoothing: 'antialiased',
    }}>
      {/* Header */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: INK.bg,
        borderBottom: `1px solid ${INK.line}`,
        padding: '20px 24px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 12 }}>
          <h1 style={{
            fontFamily: FONT_BODY,
            fontWeight: 500,
            fontSize: 20,
            color: BONE.bone,
            letterSpacing: '-0.01em',
            margin: 0,
          }}>Timeline</h1>
          <span style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            letterSpacing: 2,
            color: BONE.bone3,
            textTransform: 'uppercase',
          }}>
            {vlogs.length} {vlogs.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        {/* Pill row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([
            ['all', 'All'],
            ['vlogs', 'Vlogs'],
            ['threads', 'Threads'],
            ['posts', 'Posts'],
            ['clips', 'Clips'],
            ['articles', 'Articles'],
            ['broll', 'B-roll'],
            ['attachments', 'Attachments'],
            ['surfaced', 'Surfaced'],
          ] as [CardFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                padding: '5px 11px',
                borderRadius: 999,
                border: `1px solid ${filter === key ? BONE.bone : INK.line}`,
                background: filter === key ? BONE.sigSoft : 'transparent',
                color: filter === key ? BONE.bone : BONE.bone3,
                cursor: 'pointer',
                transition: 'all 0.12s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main style={{ padding: '12px 24px 80px', maxWidth: 760, margin: '0 auto' }}>
        {loading && (
          <div style={{ padding: '48px 0', fontSize: 11, letterSpacing: 2, color: BONE.bone4, fontFamily: FONT_MONO }}>
            LOADING…
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: '48px 0', fontSize: 12, color: STATE.err }}>
            Error: {error}
          </div>
        )}
        {!loading && !error && vlogs.length === 0 && (
          <div style={{ padding: '64px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: BONE.bone4, fontFamily: FONT_MONO }}>
              NO ITEMS YET
            </div>
            <div style={{ fontSize: 12, color: BONE.bone3, marginTop: 8 }}>
              Tap Capture to upload your first vlog.
            </div>
          </div>
        )}

        {!loading && !error && groupedByDay.map(group => (
          <section key={group.iso} style={{ marginBottom: 28 }}>
            <div style={{
              position: 'sticky',
              top: 116,
              background: INK.bg,
              padding: '8px 0 12px',
              zIndex: 10,
              fontFamily: FONT_MONO,
              fontSize: 10,
              letterSpacing: 3,
              color: BONE.bone3,
              textTransform: 'uppercase',
            }}>
              {group.day}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(filter === 'all' || filter === 'vlogs') && group.cards.map(v => (
                <VlogCard key={v.id} vlog={v} />
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* Capture FAB */}
      <Link
        href="/capture"
        style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          width: 52,
          height: 52,
          borderRadius: 999,
          background: BONE.bone,
          color: INK.ink,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontWeight: 500,
          textDecoration: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          zIndex: 30,
        }}
        aria-label="Capture"
      >
        +
      </Link>
    </div>
  )
}

// ─── Vlog card ────────────────────────────────────────────────────────────────

function VlogCard({ vlog }: { vlog: Vlog }) {
  const duration = formatDuration(vlog.duration_seconds)
  const isArchived = vlog.pipeline_status === 'archived'
  const isComplete = vlog.pipeline_status === 'complete'
  const isError = vlog.pipeline_status === 'failed'
  const isProcessing = !isArchived && !isComplete && !isError
  const territoryColor = topicColorFor(vlog.id)
  const recordedAt = vlog.recorded_at || vlog.created_at
  const time = new Date(recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <Link
      href={`/timeline/${vlog.id}`}
      style={{
        display: 'flex',
        gap: 12,
        padding: '10px 12px',
        background: INK.ink,
        border: `1px solid ${INK.ink3}`,
        borderLeft: `2px solid ${territoryColor}`,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: 92,
        height: 56,
        flexShrink: 0,
        background: INK.ink2,
        border: `1px solid ${INK.line}`,
        overflow: 'hidden',
        position: 'relative',
      }}>
        {vlog.thumbnail_url ? (
          <img
            src={vlog.thumbnail_url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : null}
        {duration && (
          <span style={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            background: 'rgba(0,0,0,0.65)',
            color: BONE.bone1,
            fontFamily: FONT_MONO,
            fontSize: 9,
            padding: '1px 5px',
            letterSpacing: 0.5,
          }}>
            {duration}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontFamily: FONT_MONO,
            fontSize: 9,
            letterSpacing: 2,
            color: territoryColor,
            textTransform: 'uppercase',
          }}>
            VLOG
          </span>
          <span style={{
            fontFamily: FONT_MONO,
            fontSize: 9,
            letterSpacing: 1.5,
            color: BONE.bone3,
            textTransform: 'uppercase',
          }}>
            {time}
          </span>
          <span style={{ flex: 1 }} />
          {isArchived && (
            <span style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: 1.5, color: BONE.bone3, textTransform: 'uppercase' }}>
              ARCHIVED
            </span>
          )}
          {isProcessing && (
            <span style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: 1.5, color: STATE.warn, textTransform: 'uppercase' }}>
              {vlog.pipeline_status.replace(/_/g, ' ')}…
            </span>
          )}
          {isError && (
            <span style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: 1.5, color: STATE.err, textTransform: 'uppercase' }}>
              ERROR
            </span>
          )}
        </div>

        <div style={{
          fontSize: 13,
          color: BONE.bone,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: 3,
        }}>
          {vlog.original_filename.replace(/\.[^.]+$/, '')}
        </div>

        <div style={{
          fontFamily: FONT_MONO,
          fontSize: 10,
          color: BONE.bone3,
          letterSpacing: 0.5,
        }}>
          {formatBytes(vlog.file_size_bytes)}
          {vlog.has_transcript ? ' · transcribed' : ''}
        </div>
      </div>
    </Link>
  )
}
