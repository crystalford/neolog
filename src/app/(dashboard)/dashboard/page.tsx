'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { VideoUpload } from '@/types/database'

const C = {
  bg:           '#070706',
  bgSurface:    '#0e0d0b',
  bgRaised:     '#141210',
  border:       '#1e1b16',
  borderBright: '#2c2820',
  amber:        '#C8902A',
  amberDim:     '#7a5618',
  amberBright:  '#E8A840',
  amberGlow:    'rgba(200,144,42,0.09)',
  textPrimary:  '#EDE3CC',
  textSecond:   '#9A8E78',
  textDim:      '#5A5040',
  textDimmer:   '#2e2820',
  green:        '#4A8A60',
  blue:         '#4870A8',
}

function Tag({ children, color = C.amber }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: 9, letterSpacing: 2, color,
      background: `${color}12`,
      border: `1px solid ${color}25`,
      padding: '2px 8px', borderRadius: 2,
      textTransform: 'uppercase', whiteSpace: 'nowrap', fontWeight: 500,
    }}>
      {children}
    </span>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

function Card({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '16px 18px',
        background: C.bgSurface,
        border: `1px solid ${hovered && onClick ? C.borderBright : C.border}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.12s',
      }}
    >
      {children}
    </div>
  )
}

function formatDate(ts: string) {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return `Today · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDuration(secs: number | null) {
  if (!secs) return ''
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function UploadCTA({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px dashed ${hovered ? C.amber : C.borderBright}`,
        padding: '24px 28px',
        marginBottom: 40,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: hovered ? C.amberGlow : C.bgSurface,
        transition: 'all 0.2s',
      }}
    >
      <div>
        <div style={{ fontSize: 13, color: C.textPrimary, marginBottom: 4, fontWeight: 500 }}>
          Upload this week's vlogs
        </div>
        <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1 }}>
          Drop files or click · MP4, MOV, WEBM up to 5 GB
        </div>
      </div>
      <div style={{
        width: 38, height: 38,
        border: `1px solid ${C.amber}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: C.amber, fontSize: 20,
      }}>
        +
      </div>
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const supabase = createClient()

  const [uploads, setUploads] = useState<VideoUpload[]>([])
  const [postCandidates, setPostCandidates] = useState<any[]>([])
  const [entities, setEntities] = useState<any[]>([])
  const [stats, setStats] = useState({ sessions: 0, postsReady: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const uid = session.user.id

      const [
        { data: recentUploads },
        { data: readyPosts },
        { data: recentEntities },
        { count: uploadCount },
        { count: postsCount },
      ] = await Promise.all([
        supabase
          .from('video_uploads')
          .select('id, file_name, created_at, status, duration_seconds, analysis, session_id')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(4),
        supabase
          .from('post_candidates')
          .select('id, source_type, raw_content, created_at')
          .eq('user_id', uid)
          .eq('status', 'ready')
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('entities')
          .select('id, name, type, mention_count')
          .eq('user_id', uid)
          .in('type', ['project', 'goal'])
          .order('mention_count', { ascending: false })
          .limit(4),
        supabase
          .from('video_uploads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', uid),
        supabase
          .from('post_candidates')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', uid)
          .eq('status', 'ready'),
      ])

      setUploads((recentUploads ?? []) as VideoUpload[])
      setPostCandidates(readyPosts ?? [])
      setEntities(recentEntities ?? [])
      setStats({ sessions: uploadCount ?? 0, postsReady: postsCount ?? 0 })
      setLoading(false)
    }
    load()
  }, [])

  const getIdeasCount = (upload: VideoUpload) => {
    const a = upload.analysis as any
    if (!a) return 0
    return (a.content_ideas?.length ?? 0) + (a.strong_opinions?.length ?? 0)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div style={{ height: '100vh', overflowY: 'auto', padding: '36px 44px' }}>
      {/* Header */}
      <div style={{ marginBottom: 44 }}>
        <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, marginBottom: 8 }}>
          {today.toUpperCase()}
        </div>
        <div style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 30,
          fontWeight: 800,
          color: C.textPrimary,
          lineHeight: 1.1,
        }}>
          Good {greeting}.
        </div>
      </div>

      <UploadCTA onClick={() => router.push('/dashboard/videos')} />

      {/* Two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginBottom: 36 }}>
        {/* Recent sessions */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Label>RECENT SESSIONS</Label>
            <button
              onClick={() => router.push('/dashboard/videos')}
              style={{ background: 'none', border: 'none', fontSize: 9, color: C.textDim, letterSpacing: 1, cursor: 'pointer' }}
            >
              ALL →
            </button>
          </div>
          {loading ? (
            <div style={{ fontSize: 10, color: C.textDimmer, letterSpacing: 1 }}>Loading…</div>
          ) : uploads.length === 0 ? (
            <div style={{ fontSize: 11, color: C.textDimmer, padding: '16px 0' }}>No uploads yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {uploads.map(u => (
                <Card key={u.id} onClick={() => router.push('/dashboard/studio')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{
                      fontSize: 12, color: C.textPrimary,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      flex: 1, marginRight: 8,
                    }}>
                      {(u.analysis as any)?.title ?? u.file_name}
                    </div>
                    <Tag color={u.status === 'ready' ? C.amber : u.status === 'processing' ? C.blue : C.textDim}>
                      {u.status === 'ready' ? 'READY' : u.status === 'processing' ? 'PROCESSING' : (u.status ?? 'UNKNOWN').toUpperCase()}
                    </Tag>
                  </div>
                  <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1 }}>
                    {formatDate(u.created_at)}
                    {formatDuration(u.duration_seconds) && ` · ${formatDuration(u.duration_seconds)}`}
                    {getIdeasCount(u) > 0 && ` · ${getIdeasCount(u)} ideas`}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Posts ready */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Label>POSTS READY</Label>
            <button
              onClick={() => router.push('/dashboard/posts')}
              style={{ background: 'none', border: 'none', fontSize: 9, color: C.textDim, letterSpacing: 1, cursor: 'pointer' }}
            >
              {stats.postsReady > 0 ? `ALL ${stats.postsReady} →` : 'ALL →'}
            </button>
          </div>
          {loading ? (
            <div style={{ fontSize: 10, color: C.textDimmer, letterSpacing: 1 }}>Loading…</div>
          ) : postCandidates.length === 0 ? (
            <div style={{ fontSize: 11, color: C.textDimmer, padding: '16px 0' }}>
              Posts surface here after your next upload.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {postCandidates.map(p => (
                <Card key={p.id} onClick={() => router.push('/dashboard/posts')}>
                  <div style={{ marginBottom: 8 }}>
                    <Tag color={C.blue}>{(p.source_type as string).replace('_', ' ').toUpperCase()}</Tag>
                  </div>
                  <div style={{
                    fontSize: 11, color: C.textSecond, lineHeight: 1.6,
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                  }}>
                    {p.raw_content}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        padding: '18px 22px',
        background: C.bgSurface,
        border: `1px solid ${C.border}`,
        display: 'flex',
        gap: 40,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <div>
          <Label>VOICE IDENTITY</Label>
          <div style={{ marginTop: 8 }}>
            <Tag color={C.textDim}>NOT CONFIGURED</Tag>
          </div>
        </div>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.amber }}>
            {stats.sessions}
          </div>
          <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1, marginTop: 2 }}>Sessions analyzed</div>
        </div>
        {entities.slice(0, 3).map(e => (
          <div key={e.id}>
            <div style={{ fontSize: 11, color: C.textPrimary }}>{e.name}</div>
            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1, marginTop: 2 }}>
              {e.type} · {e.mention_count}×
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
