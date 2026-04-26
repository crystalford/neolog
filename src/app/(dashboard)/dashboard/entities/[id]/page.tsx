'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
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
}

const TYPE_COLORS: Record<string, string> = {
  project: C.blue,
  person:  C.green,
  goal:    C.amber,
  idea:    C.amberBright,
  skill:   '#7060A8',
  tool:    C.textSecond,
}

function relDate(ts: string) {
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function EntityDetailPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [entity, setEntity] = useState<any>(null)
  const [mentions, setMentions] = useState<any[]>([])
  const [related, setRelated] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const [entityRes, mentionsRes] = await Promise.all([
        supabase
          .from('entities')
          .select('*')
          .eq('id', id)
          .eq('user_id', session.user.id)
          .single(),
        supabase
          .from('entity_mentions')
          .select('*, video_uploads(id, file_name, recorded_at, analysis)')
          .eq('entity_id', id)
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

      setEntity(entityRes.data)
      const mentionData = mentionsRes.data ?? []
      setMentions(mentionData)

      // Build related entities: entities that appear in the same sessions
      const uploadIds = mentionData
        .map((m: any) => m.video_upload_id)
        .filter(Boolean)
        .slice(0, 10)

      if (uploadIds.length > 0) {
        const { data: relMentions } = await supabase
          .from('entity_mentions')
          .select('entity_id, entities(id, name, type, mention_count)')
          .eq('user_id', session.user.id)
          .in('video_upload_id', uploadIds)
          .neq('entity_id', id)
          .limit(50)

        const seen = new Set<string>()
        const relEntities: any[] = []
        for (const m of (relMentions ?? [])) {
          if (m.entities && !seen.has(m.entity_id)) {
            seen.add(m.entity_id)
            relEntities.push(m.entities)
          }
        }
        setRelated(relEntities.slice(0, 8))
      }

      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 3, color: C.textDimmer }}>
        LOADING…
      </div>
    )
  }

  if (!entity) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.textDimmer }}>
        Entity not found.
      </div>
    )
  }

  const typeColor = TYPE_COLORS[entity.type] ?? C.textDim

  return (
    <div style={{ height: '100vh', overflowY: 'auto', fontFamily: "'JetBrains Mono', monospace" }}>
      {/* Header */}
      <div style={{ padding: '24px 40px 20px', borderBottom: `1px solid ${C.border}`, background: C.bgSurface }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: C.textDim, fontSize: 9, letterSpacing: 2, cursor: 'pointer', padding: 0, marginBottom: 14 }}
        >
          ← BACK
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span style={{
                fontSize: 9, letterSpacing: 2, color: typeColor,
                background: `${typeColor}12`, border: `1px solid ${typeColor}25`,
                padding: '2px 8px', textTransform: 'uppercase',
              }}>
                {entity.type}
              </span>
              {entity.status && entity.status !== 'mentioned' && (
                <span style={{
                  fontSize: 9, letterSpacing: 2, color: C.green,
                  background: `${C.green}12`, border: `1px solid ${C.green}25`,
                  padding: '2px 8px', textTransform: 'uppercase',
                }}>
                  {entity.status}
                </span>
              )}
            </div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color: C.textPrimary, marginBottom: 6 }}>
              {entity.name}
            </div>
            {entity.summary && (
              <div style={{ fontSize: 12, color: C.textSecond, lineHeight: 1.6, maxWidth: 560 }}>{entity.summary}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 24, flexShrink: 0 }}>
            {[
              ['Sessions', mentions.length],
              ['Mentions', entity.mention_count ?? 0],
            ].map(([label, val]) => (
              <div key={label as string} style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.amberBright, fontFamily: "'Syne', sans-serif" }}>{val}</div>
                <div style={{ fontSize: 8, letterSpacing: 2, color: C.textDimmer, textTransform: 'uppercase', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 0, maxWidth: 1100, margin: '0 auto' }}>
        {/* Sessions */}
        <div style={{ padding: '24px 32px 40px' }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase', marginBottom: 14 }}>
            Sessions — {mentions.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {mentions.map((m: any) => {
              const upload = m.video_uploads
              const title = upload?.analysis?.title ?? upload?.file_name?.replace(/\.[^.]+$/, '') ?? 'Untitled'
              const context = m.context ?? m.quote ?? null
              return (
                <div
                  key={m.id}
                  onClick={() => upload && router.push('/dashboard/studio')}
                  style={{
                    padding: '13px 16px', background: C.bgSurface, border: `1px solid ${C.border}`,
                    cursor: upload ? 'pointer' : 'default', transition: 'border-color 0.12s',
                  }}
                  onMouseEnter={e => { if (upload) (e.currentTarget as HTMLElement).style.borderColor = C.borderBright }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: context ? 6 : 0 }}>
                    <div style={{ fontSize: 12, color: C.textPrimary }}>{title}</div>
                    <div style={{ fontSize: 9, color: C.textDim, flexShrink: 0 }}>
                      {upload?.recorded_at ? relDate(upload.recorded_at) : ''}
                    </div>
                  </div>
                  {context && (
                    <div style={{ fontSize: 10, color: C.textDim, fontStyle: 'italic', lineHeight: 1.5 }}>"{context}"</div>
                  )}
                </div>
              )
            })}
            {mentions.length === 0 && (
              <div style={{ fontSize: 10, color: C.textDimmer }}>No session mentions recorded yet.</div>
            )}
          </div>
        </div>

        {/* Related entities */}
        <div style={{ padding: '24px 20px 40px', borderLeft: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase', marginBottom: 14 }}>
            Related
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {related.map((e: any) => {
              const col = TYPE_COLORS[e.type] ?? C.textDim
              return (
                <div
                  key={e.id}
                  onClick={() => router.push(`/dashboard/entities/${e.id}`)}
                  style={{
                    padding: '10px 13px', background: C.bgSurface, border: `1px solid ${C.border}`,
                    cursor: 'pointer', transition: 'border-color 0.12s',
                  }}
                  onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.borderColor = col}
                  onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.borderColor = C.border}
                >
                  <div style={{ fontSize: 11, color: C.textPrimary, marginBottom: 2 }}>{e.name}</div>
                  <div style={{ fontSize: 8, letterSpacing: 1, color: col, textTransform: 'uppercase' }}>{e.type}</div>
                </div>
              )
            })}
            {related.length === 0 && (
              <div style={{ fontSize: 10, color: C.textDimmer }}>No related entities found.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
