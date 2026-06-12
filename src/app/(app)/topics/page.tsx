'use client'

/**
 * Topics — the create-from-scratch surface.
 *
 * Type a topic, optionally an angle and notes, and the system drafts the
 * essay around it in YOUR voice (voice-shape samples from your past vlogs
 * teach the model how you write). Same Studio downstream — record voice,
 * generate b-roll, render to MP4.
 *
 * Distinct from /subjects which surfaces concepts the operator was already
 * circling in their own vlogs. Topics is for "the LeBron essay" — things
 * you want to make a video about even when you haven't recorded yet.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'

interface Topic {
  id: string
  title: string
  framing: string | null
  angle: string | null
  state: string
  updated_at: string
  production_id: string | null
}

export default function TopicsPage() {
  const router = useRouter()
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [angle, setAngle] = useState('')
  const [notes, setNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/v2/topics', { credentials: 'include' })
      const d: any = await r.json()
      setTopics(Array.isArray(d?.topics) ? d.topics : [])
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    if (title.trim().length < 2) return
    setCreating(true); setErr(null)
    try {
      const r = await fetch('/api/v2/topics', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), angle: angle.trim(), notes: notes.trim() }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      router.push(`/topics/${d.id}`)
    } catch (e: any) {
      setErr(e?.message || String(e))
      setCreating(false)
    }
  }

  return (
    <Shell>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 4px' }}>
        <section style={{ padding: '48px 0 28px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 14,
          }}>
            Topics · video essays in your voice
          </div>
          <h1 style={{
            fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 300, letterSpacing: '-2.5px',
            lineHeight: 1.02, color: 'var(--fg)', margin: 0,
          }}>
            Write about anything.<br/>It still sounds like you.
          </h1>
          <p style={{ fontSize: 17, color: 'var(--fg-2)', maxWidth: 620, marginTop: 18, lineHeight: 1.5 }}>
            Type a subject, person, or fascination. The system drafts a video-essay script anchored on what you typed and written in the cadence of your past vlogs.
          </p>
        </section>

        {/* New topic composer */}
        <section style={{
          padding: 22, borderRadius: 14, border: '1px solid var(--line-1)',
          background: 'var(--bg-1)', marginBottom: 28,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 2.4,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 12,
          }}>NEW TOPIC</div>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder='Topic (e.g. "Money Sign LeBron, the burden of the chosen one")'
            style={{
              width: '100%', fontSize: 18, padding: '10px 12px',
              background: 'var(--bg-2)', color: 'var(--fg)',
              border: '1px solid var(--line-2)', borderRadius: 8,
            }}
          />
          <textarea
            value={angle}
            onChange={e => setAngle(e.target.value)}
            placeholder='Your angle / thesis (optional but important — what are YOU saying about this?)'
            rows={2}
            style={{
              width: '100%', fontSize: 13.5, padding: '10px 12px', marginTop: 10,
              background: 'var(--bg-2)', color: 'var(--fg)',
              border: '1px solid var(--line-2)', borderRadius: 8,
              fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical',
            }}
          />
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes / raw material (optional — facts you want included, references, anything the script should know)"
            rows={3}
            style={{
              width: '100%', fontSize: 13, padding: '10px 12px', marginTop: 10,
              background: 'var(--bg-2)', color: 'var(--fg-2)',
              border: '1px solid var(--line-2)', borderRadius: 8,
              fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <button
              onClick={create}
              disabled={creating || title.trim().length < 2}
              className="canon-btn primary"
              style={{ fontSize: 13 }}
            >
              {creating ? 'Creating…' : 'Create topic'}
            </button>
            {err && <span style={{ fontSize: 12, color: 'var(--t-terra)' }}>{err}</span>}
          </div>
        </section>

        {loading ? (
          <div style={{ padding: '40px 0', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-4)', letterSpacing: 1 }}>
            LOADING…
          </div>
        ) : topics.length === 0 ? (
          <div style={{
            padding: '32px 24px', textAlign: 'center',
            border: '1px dashed var(--line-2)', borderRadius: 14,
            color: 'var(--fg-3)', fontSize: 14, lineHeight: 1.6,
          }}>
            No topics yet. Type one above. Voice comes from your past vlogs automatically.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 60 }}>
            {topics.map(t => (
              <Link
                key={t.id}
                href={`/topics/${t.id}`}
                style={{
                  display: 'block', textDecoration: 'none', color: 'inherit',
                  border: '1px solid var(--line-1)', borderRadius: 12,
                  borderLeft: `3px solid ${topicColor(t.title)}`,
                  background: 'var(--bg-1)', padding: '16px 18px',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 400, letterSpacing: '-0.4px', color: 'var(--fg)' }}>
                  {t.title}
                </div>
                {t.angle && (
                  <div style={{ fontSize: 13, color: 'var(--fg-2)', marginTop: 6, lineHeight: 1.5 }}>
                    {t.angle}
                  </div>
                )}
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 0.6,
                  color: 'var(--fg-3)', marginTop: 8, display: 'flex', gap: 12,
                }}>
                  <span>{new Date(t.updated_at).toLocaleDateString()}</span>
                  <span style={{ textTransform: 'uppercase' }}>{t.state}</span>
                  {t.production_id && <span style={{ color: 'var(--sig)' }}>· SCRIPT EXISTS</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}
