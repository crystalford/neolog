'use client'

/**
 * Subject detail — one named concept, all of its evidence, all of its
 * deliverables in one place. The page where you turn a subject into ships:
 *   - The script (video-essay → record → MP4)
 *   - The post (≤270-char compression of the subject)
 *   - Clips (sliced delivery moments from the actual vlog footage)
 *
 * Each deliverable shows its current state inline so you know whether to
 * generate, open, or ship.
 */

export const runtime = 'edge'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'

interface Subject {
  id: string
  name: string
  framing: string | null
  named_by_system: number
  representative_quote: string | null
  concept_confidence: number | null
  ripeness_score: number
  state: string
  subject_source: string | null
  updated_at: string
}

interface Moment {
  thread_id: string
  vlog_id: string
  vlog_title: string | null
  vlog_filename: string | null
  vlog_recorded_at: string | null
  topic: string
  take: string | null
  key_quotes: string | null
  strength: number | null
  span_start: number | null
  span_end: number | null
  role: string
}

interface ClusterProd { id: string; production_type: string; state: string; created_at: string; script_text: string | null }
interface ClipProd   { id: string; thread_id: string; state: string; created_at: string; output_r2_key: string | null }

export default function SubjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [subject, setSubject] = useState<Subject | null>(null)
  const [moments, setMoments] = useState<Moment[]>([])
  const [clusterProds, setClusterProds] = useState<ClusterProd[]>([])
  const [clipProds, setClipProds] = useState<ClipProd[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/v2/subjects/${id}`, { credentials: 'include' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d: any = await r.json()
      setSubject(d.subject)
      setMoments(d.moments ?? [])
      setClusterProds(d.deliverables?.cluster ?? [])
      setClipProds(d.deliverables?.clips ?? [])
    } catch (e: any) {
      setNote(`Couldn’t load subject: ${e?.message || e}`)
    } finally {
      setLoading(false)
    }
  }, [id])
  useEffect(() => { load() }, [load])

  const findProd = (type: string) => clusterProds.find(p => p.production_type === type) ?? null
  const scriptProd = findProd('video_essay')
  const postProd = findProd('x_post')
  const shortProd = findProd('short')

  const makeProd = async (production_type: string) => {
    setBusy(production_type)
    setNote(`Drafting ${production_type.replace('_', ' ')}…`)
    try {
      const r = await fetch('/api/v2/productions', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_kind: 'cluster', source_id: id, production_type }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      const pid = d?.id || d?.production?.id
      if (production_type === 'video_essay' && pid) { router.push(`/production/${pid}`); return }
      setNote('Draft ready.')
      await load()
    } catch (e: any) {
      setNote(`Failed: ${e?.message || e}`)
    } finally {
      setBusy(null)
    }
  }

  const pullClips = async () => {
    setBusy('clips')
    setNote('Slicing clips from your strongest moments…')
    try {
      const r = await fetch(`/api/v2/subjects/${id}/pull-clips`, { method: 'POST', credentials: 'include' })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      if (d.clips?.length === 0) {
        setNote(d.note || 'No clip-able moments yet.')
      } else {
        const msg = `${d.new_count} new clip${d.new_count === 1 ? '' : 's'}` +
          (d.failed_count ? ` · ${d.failed_count} failed` : '')
        setNote(msg)
      }
      await load()
    } catch (e: any) {
      setNote(`Failed: ${e?.message || e}`)
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <Shell><div style={{ padding: 40, fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 1, color: 'var(--fg-4)' }}>LOADING…</div></Shell>
  }
  if (!subject) {
    return <Shell><div style={{ padding: 40, color: 'var(--t-terra)' }}>Subject not found.</div></Shell>
  }

  const color = topicColor(subject.name)

  return (
    <Shell>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 4px' }}>
        {/* Crumb */}
        <div style={{ padding: '24px 0 8px', fontSize: 12, color: 'var(--fg-3)' }}>
          <Link href="/subjects" style={{ color: 'inherit', textDecoration: 'none' }}>← Subjects</Link>
        </div>

        {/* Hero */}
        <section style={{ paddingBottom: 28 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 14,
          }}>
            Subject
            {subject.named_by_system === 1 && (
              <span style={{
                marginLeft: 12, color, border: `1px solid ${color}`, borderRadius: 100,
                padding: '2px 8px', letterSpacing: 1.2,
              }}>system-named</span>
            )}
          </div>
          <h1 style={{
            fontSize: 'clamp(36px, 5.5vw, 60px)', fontWeight: 300, letterSpacing: '-2px',
            lineHeight: 1.05, color: 'var(--fg)', margin: 0,
            borderLeft: `4px solid ${color}`, paddingLeft: 20,
          }}>
            {subject.name}
          </h1>
          {subject.framing && (
            <p style={{ fontSize: 17, color: 'var(--fg-2)', marginTop: 18, lineHeight: 1.55, maxWidth: 720 }}>
              {subject.framing}
            </p>
          )}
          <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: 0.4 }}>
            {moments.length} moment{moments.length === 1 ? '' : 's'} · strength {subject.ripeness_score}/100
            {note && <span style={{ marginLeft: 16, color: 'var(--fg-2)' }}>{note}</span>}
          </div>
        </section>

        {/* Deliverables */}
        <section style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12,
          marginBottom: 36,
        }}>
          <DeliverableCard
            label="Script"
            sub="Lock the argument, then write"
            prod={scriptProd ? { id: scriptProd.id, state: scriptProd.state } : null}
            actionLabel={scriptProd ? 'Open the script' : 'Build the script'}
            busy={busy === 'video_essay'}
            onClick={() => scriptProd
              ? router.push(`/production/${scriptProd.id}`)
              : router.push(`/subjects/${id}/skeleton`)}
            color={color}
          />
          <DeliverableCard
            label="Post"
            sub="≤270 chars, copy & ship"
            prod={postProd ? { id: postProd.id, state: postProd.state } : null}
            preview={postProd?.script_text ?? null}
            actionLabel={postProd ? 'Open' : 'Make a post'}
            busy={busy === 'x_post'}
            onClick={() => postProd ? router.push(`/production/${postProd.id}`) : makeProd('x_post')}
            color={color}
          />
          <DeliverableCard
            label="Short"
            sub="30-60s vertical · TikTok / Reels / Shorts"
            prod={shortProd ? { id: shortProd.id, state: shortProd.state } : null}
            actionLabel={shortProd ? 'Open the short' : 'Make a short'}
            busy={busy === 'short'}
            onClick={() => shortProd ? router.push(`/production/${shortProd.id}`) : makeProd('short')}
            color={color}
          />
          <DeliverableCard
            label="Clips"
            sub={clipProds.length > 0 ? `${clipProds.length} sliced` : 'Sharpest delivery moments'}
            prod={null}
            actionLabel={clipProds.length > 0 ? 'Pull more' : 'Pull clips'}
            busy={busy === 'clips'}
            onClick={pullClips}
            color={color}
          />
        </section>

        {/* Existing clips */}
        {clipProds.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <h3 style={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
              textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 12,
            }}>
              Clips ({clipProds.length})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {clipProds.map(c => (
                <Link
                  key={c.id}
                  href={`/production/${c.id}`}
                  style={{
                    border: '1px solid var(--line-1)', borderRadius: 10, padding: '12px 14px',
                    background: 'var(--bg-1)', color: 'var(--fg-2)', textDecoration: 'none',
                    fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 4,
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.4, color: 'var(--fg-3)', textTransform: 'uppercase' }}>
                    {c.state}
                  </span>
                  <span>Clip · {new Date(c.created_at).toLocaleDateString()}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Member moments */}
        <section style={{ paddingBottom: 64 }}>
          <h3 style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 12,
          }}>
            What you actually said ({moments.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {moments.map(m => {
              const quote = firstQuote(m.key_quotes)
              return (
                <Link
                  key={m.thread_id}
                  href={`/vlog/${m.vlog_id}`}
                  style={{
                    display: 'block', textDecoration: 'none', color: 'inherit',
                    border: '1px solid var(--line-1)', borderRadius: 10,
                    padding: '14px 16px', background: 'var(--bg-1)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: 1 }}>
                      {m.vlog_recorded_at ? new Date(m.vlog_recorded_at).toLocaleDateString() : '—'}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>{m.topic}</span>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', letterSpacing: 1,
                      marginLeft: 'auto', textTransform: 'uppercase',
                    }}>{m.role}</span>
                  </div>
                  {(m.take || quote) && (
                    <p style={{ fontSize: 14, color: 'var(--fg)', marginTop: 8, lineHeight: 1.5 }}>
                      {m.take || `“${quote}”`}
                    </p>
                  )}
                </Link>
              )
            })}
          </div>
        </section>
      </div>
    </Shell>
  )
}

function DeliverableCard({
  label, sub, prod, preview, actionLabel, busy, onClick, color,
}: {
  label: string
  sub: string
  prod: { id: string; state: string } | null
  preview?: string | null
  actionLabel: string
  busy: boolean
  onClick: () => void
  color: string
}) {
  return (
    <div style={{
      border: '1px solid var(--line-1)', borderRadius: 12, padding: '18px 18px 16px',
      background: 'var(--bg-1)', display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 400, letterSpacing: '-0.3px', color: 'var(--fg)' }}>{label}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: 1, textTransform: 'uppercase' }}>
            {sub}
          </div>
        </div>
        {prod && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: 1.2, textTransform: 'uppercase',
            color, border: `1px solid ${color}`, borderRadius: 100, padding: '2px 8px',
          }}>{prod.state}</span>
        )}
      </div>
      {preview && (
        <div style={{ fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.45, maxHeight: 80, overflow: 'hidden' }}>
          {preview}
        </div>
      )}
      <button
        onClick={onClick}
        disabled={busy}
        className="canon-btn primary"
        style={{ fontSize: 12.5, opacity: busy ? 0.6 : 1 }}
      >
        {busy ? '…' : actionLabel}
      </button>
    </div>
  )
}

function firstQuote(keyQuotesJson: string | null): string {
  if (!keyQuotesJson) return ''
  try {
    const arr = JSON.parse(keyQuotesJson)
    if (Array.isArray(arr) && arr.length > 0) return String(arr[0])
  } catch { return keyQuotesJson }
  return ''
}
