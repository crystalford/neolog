'use client'

/**
 * Subjects — the home of the new product.
 *
 * The named concepts the operator keeps returning to, built by the librarian
 * pass over all their extracted threads. The 300+ vlogs and their thousands
 * of micro-threads go silent here — they're fuel. What's loud is a handful of
 * subjects, correctly named (including the ones the operator intuited but
 * couldn't name), strongest first.
 *
 * Each card → "Make the script" generates a video-essay script anchored on
 * the named concept (via the existing production pipeline) and opens it for
 * review + recording.
 *
 * Data: GET /api/v2/subjects · POST /api/v2/admin/build-subjects (rebuild).
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'

interface Subject {
  id: string
  name: string
  framing: string | null
  named_by_system: number
  concept_confidence: number | null
  representative_quote: string | null
  ripeness_score: number
  state: string
  thread_count: number
  vlog_count: number
  production_id: string | null
}

export default function SubjectsPage() {
  const router = useRouter()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)
  const [makingId, setMakingId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/v2/subjects', { credentials: 'include' })
      const d: any = await r.json()
      setSubjects(Array.isArray(d?.subjects) ? d.subjects : [])
    } catch (e: any) {
      setNote(`Couldn't load subjects: ${e?.message || e}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const rebuild = async () => {
    setBuilding(true)
    setNote('Reading across everything you’ve said… this takes a moment.')
    try {
      const r = await fetch('/api/v2/admin/build-subjects', { method: 'POST', credentials: 'include' })
      const d: any = await r.json()
      if (!r.ok || !d.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setNote(`Found ${d.subjects_written} subject${d.subjects_written === 1 ? '' : 's'} across your recordings.`)
      await load()
    } catch (e: any) {
      setNote(`Rebuild failed: ${e?.message || e}`)
    } finally {
      setBuilding(false)
    }
  }

  const makeScript = async (s: Subject) => {
    if (s.production_id) { router.push(`/production/${s.production_id}`); return }
    setMakingId(s.id)
    setNote(`Drafting a video-essay script for “${s.name}”…`)
    try {
      const r = await fetch('/api/v2/productions', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_kind: 'cluster', source_id: s.id, production_type: 'video_essay' }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      const pid = d?.id || d?.production?.id
      if (pid) { router.push(`/production/${pid}`); return }
      setNote('Script created.')
      await load()
    } catch (e: any) {
      setNote(`Couldn’t make the script: ${e?.message || e}`)
    } finally {
      setMakingId(null)
    }
  }

  return (
    <Shell>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 4px' }}>
        {/* Hero */}
        <section style={{ padding: '48px 0 28px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 14,
          }}>
            Subjects · what you keep circling
          </div>
          <h1 style={{
            fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 300, letterSpacing: '-2.5px',
            lineHeight: 1.02, color: 'var(--fg)', margin: 0,
          }}>
            The ideas you keep<br/>coming back to.
          </h1>
          <p style={{ fontSize: 17, color: 'var(--fg-2)', maxWidth: 620, marginTop: 18, lineHeight: 1.5 }}>
            Pulled from everything you&rsquo;ve recorded. Each one is a video essay waiting to be made &mdash;
            named for what it actually is, even when you didn&rsquo;t have the word for it.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <button
              onClick={rebuild}
              disabled={building}
              className="canon-btn primary"
              style={{ fontSize: 13, opacity: building ? 0.6 : 1 }}
            >
              {building ? 'Reading…' : subjects.length === 0 ? 'Find my subjects' : 'Rebuild from my vlogs'}
            </button>
            {note && <span style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>{note}</span>}
          </div>
        </section>

        {/* Subject list */}
        {loading ? (
          <div style={{ padding: '40px 0', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-4)', letterSpacing: 1 }}>
            LOADING&hellip;
          </div>
        ) : subjects.length === 0 ? (
          <div style={{
            padding: '40px 24px', textAlign: 'center',
            border: '1px dashed var(--line-2)', borderRadius: 14,
            color: 'var(--fg-3)', fontSize: 14, lineHeight: 1.6,
          }}>
            No subjects yet. Hit <strong style={{ color: 'var(--fg-2)' }}>Find my subjects</strong> and
            the librarian will read across everything you&rsquo;ve recorded and surface the concepts you keep circling.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 64 }}>
            {subjects.map(s => (
              <SubjectCard
                key={s.id}
                s={s}
                making={makingId === s.id}
                onMake={() => makeScript(s)}
              />
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}

function SubjectCard({ s, making, onMake }: { s: Subject; making: boolean; onMake: () => void }) {
  const color = topicColor(s.name)
  const dots = Math.max(1, Math.min(5, Math.round(s.ripeness_score / 20)))
  return (
    <div style={{
      border: '1px solid var(--line-1)', borderRadius: 14,
      borderLeft: `3px solid ${color}`,
      background: 'var(--bg-1)', padding: '20px 22px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 22, fontWeight: 400, letterSpacing: '-0.6px', color: 'var(--fg)', margin: 0 }}>
              {s.name}
            </h2>
            {s.named_by_system === 1 && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: 1.2, textTransform: 'uppercase',
                color: color, border: `1px solid ${color}`, borderRadius: 100, padding: '2px 8px',
              }} title="You were describing this without the term — the system named it.">
                named for you
              </span>
            )}
          </div>
          {s.framing && (
            <p style={{ fontSize: 14, color: 'var(--fg-2)', marginTop: 6, lineHeight: 1.5 }}>{s.framing}</p>
          )}
        </div>
        {/* Strength dots */}
        <div style={{ display: 'flex', gap: 3, paddingTop: 8, flexShrink: 0 }} title={`Strength ${s.ripeness_score}/100`}>
          {[1, 2, 3, 4, 5].map(i => (
            <span key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: i <= dots ? color : 'var(--line-2)',
            }}/>
          ))}
        </div>
      </div>

      {s.representative_quote && (
        <div style={{
          fontSize: 13.5, color: 'var(--fg-2)', fontStyle: 'italic',
          borderLeft: `2px solid var(--line-2)`, paddingLeft: 12, lineHeight: 1.5,
        }}>
          &ldquo;{s.representative_quote}&rdquo;
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 2 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: 0.4 }}>
          {s.thread_count} moment{s.thread_count === 1 ? '' : 's'} · {s.vlog_count} vlog{s.vlog_count === 1 ? '' : 's'}
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={onMake}
            disabled={making}
            className="canon-btn primary"
            style={{ fontSize: 12.5, opacity: making ? 0.6 : 1 }}
          >
            {making ? 'Drafting…' : s.production_id ? 'Open the script →' : 'Make the script'}
          </button>
        </div>
      </div>
    </div>
  )
}
