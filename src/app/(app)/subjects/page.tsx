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
import Link from 'next/link'
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
  subject_kind: string | null
  pole_a: string | null
  pole_b: string | null
  pole_a_at: string | null
  pole_b_at: string | null
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
      // Live ingestion: when there are new threads since the last librarian
      // run, the API fires a background rebuild. Surface that so the
      // operator knows fresh subjects are coming on the next refresh.
      if (d?.refreshing) {
        setNote(
          `${d.new_threads_pending} new moment${d.new_threads_pending === 1 ? '' : 's'} since the last pass. ` +
          `Refreshing in the background — reload in a moment to see updates.`,
        )
      }
    } catch (e: any) {
      setNote(`Couldn't load subjects: ${e?.message || e}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const rebuild = async () => {
    setBuilding(true)
    setNote('Reading every take across your vlogs… the librarian pass takes ~20–60s.')
    try {
      const r = await fetch('/api/v2/admin/build-subjects', { method: 'POST', credentials: 'include' })
      const d: any = await r.json()
      if (!r.ok || !d.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      const modelLine = d?.model
        ? ` · ran on ${shortModelName(d.model)}${String(d.model).includes('fallback') ? ' ⚠' : ''}`
        : ''
      const tenseSubjects = Array.isArray(d.subjects) ? d.subjects.filter((s: any) => /^[⚡↗?]/.test(s.name)).length : 0
      const tensionLine = tenseSubjects > 0 ? ` · ${tenseSubjects} tension/evolution/loop` : ''
      setNote(`Found ${d.subjects_written} subject${d.subjects_written === 1 ? '' : 's'}${tensionLine}${modelLine}.`)
      await load()
    } catch (e: any) {
      setNote(`Rebuild failed: ${e?.message || e}`)
    } finally {
      setBuilding(false)
    }
  }

  const makeScript = async (s: Subject) => {
    // Phase 4: route into the skeleton-first flow. Operator locks the
    // argument shape before any prose is written. Existing scripts open
    // directly into the production page.
    if (s.production_id) { router.push(`/production/${s.production_id}`); return }
    router.push(`/subjects/${s.id}/skeleton`)
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
  const isTension = s.subject_kind === 'tension'
  const isEvolution = s.subject_kind === 'evolution'
  const isOpenLoop = s.subject_kind === 'open_loop'
  const isCandidate = s.subject_kind === 'candidate'
  const isAlive = isTension || isEvolution || isOpenLoop
  // Tensions/evolutions/open-loops get distinct treatment — they're the
  // sharpest essay seeds and need to feel different from plain themes.
  const accent = isTension ? 'var(--t-terra)' : isEvolution ? 'var(--t-violet)' : isOpenLoop ? 'var(--t-ochre)' : topicColor(s.name)
  const color = accent
  const dots = Math.max(1, Math.min(5, Math.round(s.ripeness_score / 20)))
  const kindLabel = isTension ? 'tension' : isEvolution ? 'evolution' : isOpenLoop ? 'open loop' : isCandidate ? 'candidate · said once' : null
  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'
  return (
    <div style={{
      border: `1px solid ${isAlive ? color : 'var(--line-1)'}`, borderRadius: 14,
      borderLeft: `${isAlive ? 4 : 3}px solid ${color}`,
      background: isAlive ? 'rgba(255,255,255,0.015)' : 'var(--bg-1)', padding: '20px 22px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {kindLabel && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase',
                color, border: `1px solid ${color}`, borderRadius: 4, padding: '2px 8px',
              }}>{kindLabel}</span>
            )}
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

      {/* Pole comparison — only for tensions / evolutions */}
      {(isTension || isEvolution) && (s.pole_a || s.pole_b) && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'stretch',
        }}>
          <PoleBox label={formatDate(s.pole_a_at)} text={s.pole_a} accent={color}/>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-3)',
          }}>{isTension ? '⇄' : '→'}</div>
          <PoleBox label={formatDate(s.pole_b_at)} text={s.pole_b} accent={color}/>
        </div>
      )}

      {!isAlive && s.representative_quote && (
        <div style={{
          fontSize: 13.5, color: 'var(--fg-2)', fontStyle: 'italic',
          borderLeft: `2px solid var(--line-2)`, paddingLeft: 12, lineHeight: 1.5,
        }}>
          &ldquo;{s.representative_quote}&rdquo;
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 2, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: 0.4 }}>
          {s.thread_count} moment{s.thread_count === 1 ? '' : 's'} · {s.vlog_count} vlog{s.vlog_count === 1 ? '' : 's'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link
            href={`/subjects/${s.id}`}
            className="canon-btn ghost"
            style={{ fontSize: 12.5, textDecoration: 'none' }}
          >
            Open subject
          </Link>
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

function shortModelName(model: string): string {
  const s = String(model)
  if (s.includes('gpt-oss-120b')) return 'gpt-oss-120b'
  if (s.includes('gpt-oss-20b')) return 'gpt-oss-20b'
  if (s.includes('llama-3.3-70b')) return 'llama-70b'
  if (s.includes('claude')) return 'claude'
  return s
}

function PoleBox({ label, text, accent }: { label: string; text: string | null; accent: string }) {
  return (
    <div style={{
      border: '1px solid var(--line-1)', borderRadius: 8, padding: '10px 12px',
      background: 'var(--bg-2)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: 1.2,
        textTransform: 'uppercase', color: accent,
      }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.4 }}>{text || '—'}</div>
    </div>
  )
}
