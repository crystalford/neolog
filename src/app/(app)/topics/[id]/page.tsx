'use client'

/**
 * Topic detail — edit title/angle/notes inline, then build a video-essay
 * script in your voice. Same downstream as Subjects: production page,
 * record/synth voice, generate b-roll, render.
 */

export const runtime = 'edge'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'

interface Topic {
  id: string; title: string; framing: string | null; angle: string | null
  notes: string | null; state: string; updated_at: string
}
interface Production { id: string; state: string }

export default function TopicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [topic, setTopic] = useState<Topic | null>(null)
  const [production, setProduction] = useState<Production | null>(null)
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)
  const [savingField, setSavingField] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/v2/topics/${id}`, { credentials: 'include' })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setTopic(d.topic)
      setProduction(d.production ?? null)
    } catch (e: any) {
      setNote(e?.message || String(e))
    } finally { setLoading(false) }
  }, [id])
  useEffect(() => { load() }, [load])

  const patch = async (field: 'title' | 'angle' | 'notes' | 'framing', value: string) => {
    setSavingField(field)
    try {
      await fetch(`/api/v2/topics/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
    } finally { setSavingField(null) }
  }

  const build = async () => {
    if (production) { router.push(`/production/${production.id}`); return }
    setBuilding(true)
    setNote('Drafting the script anchored on your topic, written in the cadence of your past vlogs… ~45s')
    try {
      const r = await fetch('/api/v2/productions', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_kind: 'topic', source_id: id, production_type: 'video_essay',
        }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      const pid = d?.id || d?.production?.id
      if (pid) router.push(`/production/${pid}`)
      else { setNote('Script created.'); await load() }
    } catch (e: any) {
      setNote(`Build failed: ${e?.message || e}`)
      setBuilding(false)
    }
  }

  const deleteTopic = async () => {
    if (!confirm(`Delete topic "${topic?.title}"?`)) return
    await fetch(`/api/v2/topics/${id}`, { method: 'DELETE', credentials: 'include' })
    router.push('/topics')
  }

  if (loading) return <Shell><div style={{ padding: 40, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, letterSpacing: 1, color: 'var(--fg-4)' }}>LOADING…</div></Shell>
  if (!topic) return <Shell><div style={{ padding: 40, color: 'var(--t-terra)' }}>Topic not found.</div></Shell>

  const color = topicColor(topic.title)

  return (
    <Shell>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 4px' }}>
        <div style={{ padding: '24px 0 8px', fontSize: 12, color: 'var(--fg-3)' }}>
          <Link href="/topics" style={{ color: 'inherit', textDecoration: 'none' }}>← Topics</Link>
        </div>

        <section style={{ paddingBottom: 24 }}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: 3.2,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 10,
          }}>Topic</div>
          <input
            type="text"
            defaultValue={topic.title}
            onBlur={e => patch('title', e.target.value.trim())}
            style={{
              width: '100%', fontSize: 'clamp(28px, 4.5vw, 44px)', fontWeight: 300,
              letterSpacing: '-1.5px', lineHeight: 1.1, color: 'var(--fg)',
              background: 'transparent', border: 'none',
              borderLeft: `4px solid ${color}`, paddingLeft: 16,
            }}
          />
          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--fg-3)', marginTop: 12,
          }}>
            {savingField ? 'Saving…' : 'Edit fields inline. Auto-save on blur.'}
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 28 }}>
          <FieldBlock
            label="Your angle / thesis"
            sub="The shape of the argument. What's YOUR take? Strong angles produce strong scripts."
            initial={topic.angle ?? ''}
            placeholder='e.g. "He didn\'t choose his role, but he keeps re-choosing it every year."'
            onSave={v => patch('angle', v)}
            rows={3}
          />
          <FieldBlock
            label="Notes / raw material"
            sub="Facts, references, links, the things the script must know. The generator uses these as material, not as quotes."
            initial={topic.notes ?? ''}
            placeholder="Anything the script should know…"
            onSave={v => patch('notes', v)}
            rows={6}
          />
        </section>

        <section style={{ display: 'flex', gap: 10, paddingBottom: 64, flexWrap: 'wrap' }}>
          <button
            onClick={build}
            disabled={building}
            className="canon-btn primary"
            style={{ fontSize: 13 }}
          >
            {building ? 'Drafting…' : production ? 'Open the script →' : 'Build the script'}
          </button>
          <button
            onClick={deleteTopic}
            className="canon-btn ghost"
            style={{ fontSize: 12, color: 'var(--t-terra)' }}
          >
            Delete topic
          </button>
          {note && <span style={{ fontSize: 12, color: 'var(--fg-3)', alignSelf: 'center' }}>{note}</span>}
        </section>
      </div>
    </Shell>
  )
}

function FieldBlock({ label, sub, initial, placeholder, onSave, rows }: {
  label: string; sub: string; initial: string; placeholder: string
  onSave: (v: string) => Promise<void>
  rows: number
}) {
  const [val, setVal] = useState(initial)
  return (
    <div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: 1.8,
        textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 4,
      }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginBottom: 8 }}>{sub}</div>
      <textarea
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => onSave(val.trim())}
        placeholder={placeholder}
        rows={rows}
        style={{
          width: '100%', fontSize: 13.5, padding: '10px 12px',
          background: 'var(--bg-2)', color: 'var(--fg-1)',
          border: '1px solid var(--line-2)', borderRadius: 8,
          fontFamily: 'inherit', lineHeight: 1.55, resize: 'vertical',
        }}
      />
    </div>
  )
}
