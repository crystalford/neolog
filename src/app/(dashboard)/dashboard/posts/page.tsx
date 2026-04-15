'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
  purple:       '#7060A8',
}

type PostTab = 'ready' | 'scheduled' | 'published'

const SOURCE_COLORS: Record<string, string> = {
  quote:          C.amber,
  strong_opinion: C.blue,
  observation:    C.blue,
  clip:           C.purple,
  announcement:   C.green,
  achievement:    C.green,
}

function Tag({ children, color = C.amber }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: 9, letterSpacing: 2, color,
      background: `${color}12`, border: `1px solid ${color}25`,
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

function Btn({ children, onClick, primary, small, ghost }: {
  children: React.ReactNode
  onClick?: () => void
  primary?: boolean
  small?: boolean
  ghost?: boolean
}) {
  return (
    <button onClick={onClick} style={{
      background: primary ? C.amber : 'none',
      border: `1px solid ${primary ? C.amber : C.borderBright}`,
      color: primary ? C.bg : C.textSecond,
      fontSize: small ? 9 : 10, letterSpacing: 2,
      fontWeight: primary ? 700 : 400,
      padding: small ? '4px 10px' : '8px 18px',
      transition: 'all 0.12s', whiteSpace: 'nowrap',
      cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
    }}>
      {children}
    </button>
  )
}

export default function PostsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [tab, setTab] = useState<PostTab>('ready')
  const [candidates, setCandidates] = useState<any[]>([])
  const [scheduled, setScheduled] = useState<any[]>([])
  const [published, setPublished] = useState<any[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [selVer, setSelVer] = useState(0)
  const [editText, setEditText] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const [
        { data: ready },
        { data: sched },
        { data: pub },
      ] = await Promise.all([
        supabase
          .from('post_candidates')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('status', 'ready')
          .order('created_at', { ascending: false }),
        supabase
          .from('scheduled_posts')
          .select('*, post_candidate:post_candidate_id(source_type, raw_content)')
          .eq('user_id', session.user.id)
          .eq('status', 'scheduled')
          .order('scheduled_at', { ascending: true }),
        supabase
          .from('scheduled_posts')
          .select('*, post_candidate:post_candidate_id(source_type, raw_content)')
          .eq('user_id', session.user.id)
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(20),
      ])

      setCandidates(ready ?? [])
      setScheduled(sched ?? [])
      setPublished(pub ?? [])

      if (ready && ready.length > 0) {
        setSel(ready[0].id)
        const versions = ready[0].generated_versions as any[]
        setEditText(versions?.[0]?.text ?? ready[0].raw_content ?? '')
      }
      setLoading(false)
    }
    load()
  }, [])

  const selectedCandidate = candidates.find(c => c.id === sel)
  const versions: Array<{ format_name: string; text: string }> = selectedCandidate?.generated_versions ?? []

  const handleSelect = (id: string) => {
    setSel(id)
    setSelVer(0)
    const cand = candidates.find(c => c.id === id)
    const vv = cand?.generated_versions as any[]
    setEditText(vv?.[0]?.text ?? cand?.raw_content ?? '')
  }

  const handleSelectVersion = (i: number) => {
    setSelVer(i)
    setEditText(versions[i]?.text ?? '')
  }

  const handleDiscard = async () => {
    if (!sel) return
    await supabase.from('post_candidates').update({ status: 'discarded' }).eq('id', sel)
    setCandidates(prev => prev.filter(c => c.id !== sel))
    setSel(candidates.find(c => c.id !== sel)?.id ?? null)
  }

  const handleDevelopInStudio = () => router.push('/dashboard/studio')

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header + tabs */}
      <div style={{ padding: '22px 40px 0', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.textPrimary, flex: 1 }}>
            Posts
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {(['ready', 'scheduled', 'published'] as PostTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none',
              borderBottom: tab === t ? `2px solid ${C.amber}` : '2px solid transparent',
              color: tab === t ? C.amberBright : C.textDim,
              fontSize: 10, letterSpacing: 2, padding: '0 16px 11px',
              transition: 'all 0.12s', textTransform: 'uppercase',
              cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
            }}>
              {t}
              {t === 'ready' && candidates.length > 0 && (
                <span style={{ color: C.amber }}> ({candidates.length})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Ready tab */}
      {tab === 'ready' && (
        loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 10, color: C.textDimmer, letterSpacing: 2 }}>LOADING…</div>
          </div>
        ) : candidates.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ fontSize: 11, color: C.textDimmer, letterSpacing: 2 }}>NO POSTS YET</div>
            <div style={{ fontSize: 10, color: C.textDimmer }}>
              Posts are generated from your uploads. Upload a vlog to get started.
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left: candidate list */}
            <div style={{ width: 290, borderRight: `1px solid ${C.border}`, overflowY: 'auto', flexShrink: 0 }}>
              {candidates.map(p => (
                <div
                  key={p.id}
                  onClick={() => handleSelect(p.id)}
                  style={{
                    padding: '14px 18px',
                    borderBottom: `1px solid ${C.border}`,
                    borderLeft: sel === p.id ? `2px solid ${C.amber}` : '2px solid transparent',
                    background: sel === p.id ? C.amberGlow : 'none',
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  <div style={{ display: 'flex', gap: 7, marginBottom: 7, alignItems: 'center' }}>
                    <Tag color={SOURCE_COLORS[p.source_type] ?? C.amber}>
                      {p.source_type.replace('_', ' ')}
                    </Tag>
                  </div>
                  <div style={{
                    fontSize: 11, color: C.textPrimary, lineHeight: 1.5,
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                    marginBottom: 5,
                  }}>
                    {p.raw_content}
                  </div>
                  <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>
                    {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>

            {/* Right: editor */}
            {selectedCandidate && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px' }}>
                  {/* Source */}
                  <div style={{ marginBottom: 18 }}>
                    <Label>SOURCE</Label>
                    <div style={{
                      marginTop: 7, fontSize: 11, color: C.textDim,
                      padding: '8px 11px', background: C.bgRaised,
                      border: `1px solid ${C.border}`, fontStyle: 'italic',
                    }}>
                      "{selectedCandidate.raw_content}"
                    </div>
                  </div>

                  {/* Version selector */}
                  {versions.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <Label>VERSIONS — {versions.length} GENERATED</Label>
                      <div style={{ display: 'flex', gap: 5, marginTop: 9, flexWrap: 'wrap' }}>
                        {versions.map((v, i) => (
                          <button key={i} onClick={() => handleSelectVersion(i)} style={{
                            background: selVer === i ? C.amberGlow : 'none',
                            border: `1px solid ${selVer === i ? C.amber : C.border}`,
                            color: selVer === i ? C.amberBright : C.textDim,
                            fontSize: 9, letterSpacing: 2, padding: '4px 10px',
                            transition: 'all 0.12s', cursor: 'pointer',
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            {v.format_name.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Edit textarea */}
                  <div style={{ marginBottom: 18 }}>
                    <Label>EDIT</Label>
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      style={{
                        width: '100%', marginTop: 9,
                        background: C.bgRaised, border: `1px solid ${C.border}`,
                        color: C.textPrimary, fontSize: 12, padding: '12px 14px',
                        outline: 'none', resize: 'vertical', minHeight: 110,
                        lineHeight: 1.7, fontFamily: "'JetBrains Mono', monospace",
                      }}
                    />
                    <div style={{ fontSize: 9, color: C.textDim, marginTop: 5, letterSpacing: 1 }}>
                      {editText.length} chars
                    </div>
                  </div>

                  {/* Platform selector */}
                  <div>
                    <Label>PUBLISH TO</Label>
                    <div style={{ display: 'flex', gap: 5, marginTop: 9 }}>
                      {['X', 'Instagram', 'TikTok', 'YouTube'].map((p, i) => (
                        <button key={p} style={{
                          background: i === 0 ? C.amberGlow : 'none',
                          border: `1px solid ${i === 0 ? C.amber : C.border}`,
                          color: i === 0 ? C.amberBright : C.textDim,
                          fontSize: 9, letterSpacing: 2, padding: '4px 10px',
                          cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action bar */}
                <div style={{
                  padding: '12px 26px 18px',
                  borderTop: `1px solid ${C.border}`,
                  display: 'flex', gap: 8, flexWrap: 'wrap',
                }}>
                  <Btn primary>POST NOW</Btn>
                  <Btn>SCHEDULE</Btn>
                  <Btn onClick={handleDevelopInStudio}>DEVELOP IN STUDIO</Btn>
                  <Btn onClick={handleDiscard}>DISCARD</Btn>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Scheduled tab */}
      {tab === 'scheduled' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 40px' }}>
          {scheduled.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 11, color: C.textDimmer, letterSpacing: 2 }}>
              NO SCHEDULED POSTS
            </div>
          ) : scheduled.map((s: any) => (
            <div key={s.id} style={{
              padding: '14px 18px', background: C.bgSurface,
              border: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', gap: 14, marginBottom: 2,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: C.textPrimary, marginBottom: 3 }}>
                  {s.selected_version_text}
                </div>
                <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>
                  {new Date(s.scheduled_at).toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })} · {s.platform}
                </div>
              </div>
              <Btn small>EDIT</Btn>
              <button
                onClick={async () => {
                  await supabase.from('scheduled_posts').update({ status: 'cancelled' }).eq('id', s.id)
                  setScheduled(prev => prev.filter(x => x.id !== s.id))
                }}
                style={{
                  background: `${C.red}22`, border: `1px solid ${C.red}`,
                  color: '#cc8888', fontSize: 9, letterSpacing: 2, padding: '4px 10px',
                  cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                CANCEL
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Published tab */}
      {tab === 'published' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 40px' }}>
          {published.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 11, color: C.textDimmer, letterSpacing: 2 }}>
              PUBLISHED POSTS APPEAR HERE
            </div>
          ) : published.map((s: any) => (
            <div key={s.id} style={{
              padding: '14px 18px', background: C.bgSurface,
              border: `1px solid ${C.border}`, marginBottom: 2,
            }}>
              <div style={{ fontSize: 12, color: C.textPrimary, marginBottom: 3 }}>
                {s.selected_version_text}
              </div>
              <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>
                {s.platform} · {new Date(s.published_at).toLocaleDateString()}
                {s.platform_post_id && ` · ${s.platform_post_id}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
