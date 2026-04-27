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
  red:          '#8A4040',
}

function relDate(ts: string) {
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDur(s: number | null) {
  if (!s) return null
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

type DashData = {
  lastKeyWin: string | null
  lastSessionTitle: string | null
  lastSessionDate: string | null
  uploads: VideoUpload[]
  posts: any[]
  totalSessions: number
  totalEntities: number
  totalPosts: number
  processingCount: number
  recentEnergy: Array<'high' | 'medium' | 'low' | null>
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const uid = session.user.id

      const [logRes, uploadRes, postsRes, entityCount, postsCount, processingRes] = await Promise.all([
        supabase.from('log_entries').select('title, logged_at, meta')
          .eq('user_id', uid).order('logged_at', { ascending: false }).limit(1),
        supabase.from('video_uploads').select('id, file_name, created_at, recorded_at, status, duration_seconds, analysis')
          .eq('user_id', uid).order('created_at', { ascending: false }).limit(5),
        supabase.from('post_candidates').select('id, source_type, raw_content, created_at')
          .eq('user_id', uid).eq('status', 'ready').order('created_at', { ascending: false }).limit(4),
        supabase.from('entities').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('post_candidates').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'ready'),
        supabase.from('video_uploads').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'processing'),
      ])

      const lastLog = logRes.data?.[0]
      const uploads = (uploadRes.data ?? []) as VideoUpload[]

      const recentEnergy = uploads.slice(0, 10).map(u => (u.analysis as any)?.energy_level ?? null)

      setData({
        lastKeyWin: lastLog?.meta?.key_win ?? null,
        lastSessionTitle: lastLog?.title ?? null,
        lastSessionDate: lastLog?.logged_at ?? null,
        uploads,
        posts: postsRes.data ?? [],
        totalSessions: (await supabase.from('video_uploads').select('id', { count: 'exact', head: true }).eq('user_id', uid)).count ?? 0,
        totalEntities: entityCount.count ?? 0,
        totalPosts: postsCount.count ?? 0,
        processingCount: processingRes.count ?? 0,
        recentEnergy,
      })
      setLoading(false)
    }
    load()
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 3, color: C.textDimmer, textTransform: 'uppercase' }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', overflowY: 'auto', fontFamily: "'JetBrains Mono', monospace" }}>

      {/* Last key_win — hero */}
      {data?.lastKeyWin ? (
        <div style={{ padding: '32px 40px 28px', borderBottom: `1px solid ${C.border}`, background: C.amberGlow }}>
          <div style={{ fontSize: 8, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase', marginBottom: 12 }}>
            Last session · {data.lastSessionDate ? relDate(data.lastSessionDate) : ''}
            {data.lastSessionTitle && ` · ${data.lastSessionTitle}`}
          </div>
          <div style={{
            fontFamily: "'Syne', sans-serif", fontSize: 'clamp(16px, 2vw, 24px)',
            fontWeight: 700, color: C.amberBright, lineHeight: 1.35, maxWidth: 720,
            fontStyle: 'italic',
          }}>
            &ldquo;{data.lastKeyWin}&rdquo;
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={() => router.push('/dashboard/studio')}
              style={{ ...btnStyle(true) }}
            >
              Develop in Studio →
            </button>
            <button
              onClick={() => router.push('/dashboard/timeline')}
              style={{ ...btnStyle(false) }}
            >
              View timeline
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '32px 40px 28px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: C.textPrimary, marginBottom: 6 }}>
            {greeting}.
          </div>
          <div style={{ fontSize: 11, color: C.textDim }}>Upload a recording to get started.</div>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
        {[
          { val: data?.totalSessions ?? 0, label: 'Sessions' },
          { val: data?.totalEntities ?? 0, label: 'Entities' },
          { val: data?.totalPosts ?? 0, label: 'Posts ready', accent: (data?.totalPosts ?? 0) > 0 },
          { val: data?.processingCount ?? 0, label: 'Processing', accent: false },
        ].map((s, i) => (
          <div key={s.label} style={{
            flex: 1, padding: '16px 24px',
            borderLeft: i > 0 ? `1px solid ${C.border}` : 'none',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.accent ? C.amberBright : C.textPrimary, fontFamily: "'Syne', sans-serif" }}>
              {s.val}
            </div>
            <div style={{ fontSize: 8, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
        {/* Energy mini-chart */}
        <div style={{ padding: '16px 24px', borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase' }}>Energy</div>
          <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 20 }}>
            {(data?.recentEnergy ?? []).map((e, i) => (
              <div key={i} style={{
                width: 6, borderRadius: 1,
                height: e === 'high' ? 20 : e === 'medium' ? 13 : e === 'low' ? 7 : 3,
                background: e === 'high' ? C.green : e === 'low' ? C.red : C.amber,
                opacity: 0.6,
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* Upload CTA */}
      <div
        onClick={() => router.push('/dashboard/uploads')}
        style={{
          margin: '20px 40px 0',
          padding: '16px 20px',
          border: `1px dashed ${C.borderBright}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', transition: 'all 0.12s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.amber; (e.currentTarget as HTMLElement).style.background = C.amberGlow }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.borderBright; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <div>
          <div style={{ fontSize: 12, color: C.textPrimary, marginBottom: 3 }}>Upload a recording</div>
          <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>MP4 · MOV · WEBM · up to 5 GB · resumable</div>
        </div>
        <div style={{ fontSize: 20, color: C.amber }}>+</div>
      </div>

      {/* Two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, margin: '20px 40px 40px' }}>

        {/* Recent sessions */}
        <div style={{ paddingRight: 20, borderRight: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 8, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase' }}>Recent sessions</div>
            <button onClick={() => router.push('/dashboard/videos')} style={{ background: 'none', border: 'none', fontSize: 8, color: C.textDim, letterSpacing: 1, cursor: 'pointer', textTransform: 'uppercase' }}>
              All →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(data?.uploads ?? []).map(u => {
              const title = (u.analysis as any)?.title ?? u.file_name?.replace(/\.[^.]+$/, '') ?? 'Untitled'
              const ideas = ((u.analysis as any)?.content_ideas?.length ?? 0) + ((u.analysis as any)?.strong_opinions?.length ?? 0)
              const isProcessed = u.status === 'processed' || u.status === 'ready'
              return (
                <div
                  key={u.id}
                  onClick={() => router.push('/dashboard/studio')}
                  style={{
                    padding: '11px 14px', background: C.bgSurface, border: `1px solid ${C.border}`,
                    cursor: 'pointer', transition: 'border-color 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderBright)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 11, color: C.textPrimary, lineHeight: 1.3, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {title}
                    </div>
                    <div style={{
                      fontSize: 7, letterSpacing: 1, padding: '2px 6px', flexShrink: 0,
                      color: isProcessed ? C.green : C.textDim,
                      border: `1px solid ${isProcessed ? C.green : C.border}25`,
                      background: isProcessed ? `${C.green}12` : 'none',
                      textTransform: 'uppercase',
                    }}>
                      {u.status}
                    </div>
                  </div>
                  <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 0.5 }}>
                    {relDate(u.recorded_at ?? u.created_at)}
                    {fmtDur(u.duration_seconds) && ` · ${fmtDur(u.duration_seconds)}`}
                    {ideas > 0 && ` · ${ideas} ideas`}
                  </div>
                </div>
              )
            })}
            {(data?.uploads?.length ?? 0) === 0 && (
              <div style={{ fontSize: 10, color: C.textDimmer, padding: '12px 0' }}>No uploads yet.</div>
            )}
          </div>
        </div>

        {/* Posts ready */}
        <div style={{ paddingLeft: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 8, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase' }}>Posts ready</div>
            {(data?.totalPosts ?? 0) > 0 && (
              <button onClick={() => router.push('/dashboard/posts')} style={{ background: 'none', border: 'none', fontSize: 8, color: C.textDim, letterSpacing: 1, cursor: 'pointer', textTransform: 'uppercase' }}>
                All {data?.totalPosts} →
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(data?.posts ?? []).map(p => (
              <div
                key={p.id}
                onClick={() => router.push('/dashboard/posts')}
                style={{
                  padding: '11px 14px', background: C.bgSurface, border: `1px solid ${C.border}`,
                  cursor: 'pointer', transition: 'border-color 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderBright)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
              >
                <div style={{ fontSize: 7, letterSpacing: 1, color: C.blue, textTransform: 'uppercase', marginBottom: 5 }}>
                  {(p.source_type as string).replace('_', ' ')}
                </div>
                <div style={{
                  fontSize: 11, color: C.textSecond, lineHeight: 1.5,
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                }}>
                  {p.raw_content}
                </div>
              </div>
            ))}
            {(data?.posts?.length ?? 0) === 0 && (
              <div style={{ fontSize: 10, color: C.textDimmer, padding: '12px 0' }}>
                Posts surface automatically after your next upload.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function btnStyle(primary: boolean): React.CSSProperties {
  return {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9, letterSpacing: 2, textTransform: 'uppercase',
    padding: '7px 16px', cursor: 'pointer',
    background: primary ? C.amber : 'none',
    border: `1px solid ${primary ? C.amber : C.borderBright}`,
    color: primary ? C.bg : C.textSecond,
    fontWeight: primary ? 700 : 400,
  }
}
