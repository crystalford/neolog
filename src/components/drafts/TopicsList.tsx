'use client'

/**
 * TopicsList — the Topics tab body on /drafts.
 *
 * Extracted from the former standalone /topics page (now a redirect to
 * /drafts?tab=topics). Type a topic, optionally an angle and notes, and
 * the system drafts the essay around it in the operator's voice.
 *
 * Distinct from Subjects (concepts already circled in past vlogs) —
 * Topics is for things worth making a video about even without having
 * recorded anything yet.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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

export function TopicsList() {
  const router = useRouter()
  const sp = useSearchParams()
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState(() => (sp?.get('quick') ?? '').slice(0, 200))
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
    <div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 60 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="neolog-skeleton" style={{ height: 76, opacity: 1 - i * 0.25 }}/>
          ))}
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
              className="neolog-card-lift"
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
  )
}
