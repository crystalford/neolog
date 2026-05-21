/**
 * Cluster detail — the deliberate-work view.
 *
 * Shows the cluster's threads + insights from the cultivate pass.
 * Lets the operator trigger a fresh cultivate (Workers AI default,
 * Sonnet opt-in escalation).
 *
 * Read flow: GET /api/v2/clusters/[id] returns { cluster: { ...,
 * threads: [], insights: [{ kind, kind_label, title, body,
 * bounce_run_id }] } }.
 *
 * Cultivate flow: POST /api/v2/admin/cultivate-clusters with
 * { cluster_id, model }. On success, reload to see new insights.
 */
'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'

interface ThreadInCluster { id: string; topic: string; take: string; strength: number | null }
interface Insight {
  kind: string
  kind_label: string
  title: string | null
  body: string
  bounce_run_id: string | null
  created_at: string
}
interface ClusterDetail {
  id: string
  topic: string
  abstracted_topic: string | null
  take: string | null
  state: string
  ripeness_score: number
  form: string | null
  gap_question: string | null
  topic_color: string | null
  threads: ThreadInCluster[]
  insights: Insight[]
}

export default function ClusterDetailPage({ params }: { params: { id: string } }) {
  const [c, setC] = useState<ClusterDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cultivating, setCultivating] = useState<null | 'workers' | 'sonnet'>(null)
  const [cultivateNote, setCultivateNote] = useState<string | null>(null)

  const load = () => {
    fetch(`/api/v2/clusters/${params.id}`, { credentials: 'include' })
      .then(async (r: any) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: any) => setC(d.cluster))
      .catch(e => setError(String(e.message || e)))
  }
  useEffect(() => { load() }, [params.id])

  const cultivate = async (which: 'workers' | 'sonnet') => {
    setCultivating(which)
    setCultivateNote(null)
    try {
      const r = await fetch('/api/v2/admin/cultivate-clusters', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // 'workers' = use operator's default Workers AI model (Llama70b).
        // 'sonnet' = explicit per-cluster escalation to Anthropic.
        body: JSON.stringify({
          cluster_id: params.id,
          ...(which === 'sonnet' ? { model: 'sonnet' } : {}),
        }),
      })
      const d: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      const cult = d.cultivated?.[0]
      const errMsg = d.errors?.[0]?.message
      if (errMsg) {
        setCultivateNote(`Failed: ${errMsg}`)
      } else if (cult) {
        setCultivateNote(
          `${cult.model} produced ${cult.insights_created} insight${cult.insights_created === 1 ? '' : 's'}` +
          (cult.concept_name ? ` · named concept: "${cult.concept_name}"` : ' · no named concept matched') +
          ` · ${cult.tokens?.in ?? 0} in / ${cult.tokens?.out ?? 0} out tokens`
        )
      }
      load()
    } catch (e: any) {
      setCultivateNote(`Failed: ${String(e?.message || e).slice(0, 240)}`)
    } finally {
      setCultivating(null)
    }
  }

  if (error) {
    return (
      <Shell active="clusters" breadcrumb={['Clusters', 'Error']}>
        <div className="pad-tight" style={{ color: 'var(--err)' }}>Error: {error}</div>
      </Shell>
    )
  }
  if (!c) {
    return (
      <Shell active="clusters" breadcrumb={['Clusters', '…']}>
        <div className="pad-tight" style={{ color: 'var(--fg-3)' }}>Loading…</div>
      </Shell>
    )
  }

  const color = topicColor(c.abstracted_topic ?? c.topic_color ?? c.topic ?? 'misc')
  const ready = c.state === 'ready'

  return (
    <Shell active="clusters" breadcrumb={['Clusters', c.abstracted_topic ?? c.topic]}>
      <div className="pad-tight" style={{ maxWidth: 940, marginLeft: 'auto', marginRight: 'auto' }}>

        {/* Editorial hero with topic spine */}
        <div style={{
          borderLeft: `3px solid ${color}`,
          paddingLeft: 16,
          marginBottom: 24,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
          }}>
            <span style={{
              fontSize: 10, color: color,
              textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 600,
              fontFamily: 'Geist Mono, ui-monospace, monospace',
            }}>
              Cluster
            </span>
            {ready
              ? <span className="pill accent">◆ ready</span>
              : <span className="pill mute">{c.state}</span>}
            <span style={{
              fontSize: 10, color: 'var(--fg-4)', letterSpacing: 0.4, textTransform: 'uppercase',
              fontFamily: 'Geist Mono, ui-monospace, monospace',
            }}>
              {c.threads.length} threads · ripeness {c.ripeness_score}/100
            </span>
          </div>
          <h1 style={{
            fontSize: 32, fontWeight: 500, letterSpacing: '-0.6px',
            lineHeight: 1.2, marginTop: 0, marginBottom: c.take ? 12 : 0,
          }}>
            {c.abstracted_topic ?? c.topic}
          </h1>
          {c.take && (
            <p style={{
              fontSize: 16, color: 'var(--fg-2)', fontStyle: 'italic',
              lineHeight: 1.55, marginTop: 0, marginBottom: 0,
            }}>
              “{c.take}”
            </p>
          )}
        </div>

        {/* Cultivate controls */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px',
          background: 'var(--bg-1)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 12, color: 'var(--fg-2)', flex: 1 }}>
            <strong style={{ color: 'var(--fg)', fontWeight: 500 }}>Cultivate.</strong>{' '}
            Ask the model to name the pattern, suggest an adjacent thinker, and cross-reference your other clusters.
          </div>
          <button
            className="btn"
            disabled={cultivating !== null}
            onClick={() => cultivate('workers')}
            title="Uses Workers AI (Llama 3.3 70B by default). In-house, no Anthropic billing."
          >
            {cultivating === 'workers' ? 'Cultivating…' : 'Cultivate'}
          </button>
          <button
            className="btn"
            disabled={cultivating !== null}
            onClick={() => cultivate('sonnet')}
            title="Escalate to Claude Sonnet 4.6 (Anthropic). ~$0.05 per run."
            style={{ fontSize: 11, color: 'var(--fg-2)' }}
          >
            {cultivating === 'sonnet' ? 'Sonnet…' : 'Re-cultivate with Sonnet'}
          </button>
        </div>

        {cultivateNote && (
          <div style={{
            padding: '8px 12px',
            background: 'var(--bg-2)', border: '1px solid var(--line)',
            borderRadius: 6, fontSize: 12, color: 'var(--fg-2)',
            marginTop: -16, marginBottom: 24,
          }}>
            {cultivateNote}
          </div>
        )}

        {/* Insights — grouped visually by kind */}
        {c.insights.length > 0 ? (
          <section style={{ marginBottom: 32 }}>
            <div style={{
              fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase',
              color: 'var(--fg-3)', marginBottom: 14,
              fontFamily: 'Geist Mono, ui-monospace, monospace',
            }}>
              Insights · {c.insights.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {c.insights.map((ins, i) => (
                <InsightCard key={i} ins={ins} accent={color}/>
              ))}
            </div>
          </section>
        ) : (
          <div style={{
            padding: 18,
            background: 'var(--bg-1)', border: '1px dashed var(--line-1)',
            borderRadius: 8, fontSize: 13, color: 'var(--fg-3)',
            marginBottom: 32, textAlign: 'center',
          }}>
            No insights yet. Click <strong>Cultivate</strong> to ask the model what this pattern is.
          </div>
        )}

        {/* Gap question (cluster-level legacy field, may be set later by macro) */}
        {c.gap_question && (
          <div style={{
            padding: 16,
            background: 'var(--bg-2)', border: '1px solid var(--line)',
            borderRadius: 8, marginBottom: 32,
            fontSize: 14, color: 'var(--fg-1)', fontStyle: 'italic',
            lineHeight: 1.55,
          }}>
            <div style={{
              fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase',
              color: 'var(--fg-4)', marginBottom: 6,
              fontFamily: 'Geist Mono, ui-monospace, monospace', fontStyle: 'normal',
            }}>
              Gap question
            </div>
            {c.gap_question}
          </div>
        )}

        {/* Threads in this cluster */}
        <section>
          <div style={{
            display: 'flex', alignItems: 'baseline',
            paddingBottom: 10, marginBottom: 14,
            borderBottom: '1px solid var(--line)',
          }}>
            <span style={{
              fontSize: 11, color: 'var(--fg-2)',
              letterSpacing: 1.5, textTransform: 'uppercase',
              fontWeight: 500,
              fontFamily: 'Geist Mono, ui-monospace, monospace',
            }}>
              Threads
            </span>
            <span style={{
              marginLeft: 'auto', fontSize: 10, color: 'var(--fg-4)',
              letterSpacing: 0.4,
              fontFamily: 'Geist Mono, ui-monospace, monospace',
            }}>
              {c.threads.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {c.threads.map(t => (
              <Link key={t.id} href={`/thread/${t.id}`} className="card" style={{
                padding: '16px 20px',
                display: 'block',
                borderLeft: `3px solid ${topicColor(t.topic)}`,
              }}>
                <div style={{
                  fontSize: 10, color: topicColor(t.topic),
                  textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
                  fontFamily: 'Geist Mono, ui-monospace, monospace',
                  marginBottom: 8,
                }}>
                  Thread · {t.topic}
                </div>
                <div style={{
                  fontSize: 15, color: 'var(--fg)',
                  lineHeight: 1.5, fontStyle: 'italic',
                }}>
                  “{t.take}”
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </Shell>
  )
}

function InsightCard({ ins, accent }: { ins: Insight; accent: string }) {
  // Different visual weight per insight kind:
  // - name = the big concept callout, hero treatment
  // - parallel = adjacent thinker / cross-ref, normal card
  // - gap_question = italic prompt, lighter
  const isName = ins.kind === 'name'
  const isGap = ins.kind === 'gap_question'
  return (
    <div style={{
      padding: isName ? '20px 24px' : '14px 18px',
      background: isName ? 'var(--bg-1)' : 'var(--bg-2)',
      border: '1px solid var(--line)',
      borderLeft: `3px solid ${isName ? 'var(--accent)' : accent}`,
      borderRadius: 8,
    }}>
      <div style={{
        fontSize: 10,
        color: isName ? 'var(--accent)' : 'var(--fg-3)',
        textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 600,
        fontFamily: 'Geist Mono, ui-monospace, monospace',
        marginBottom: 8,
      }}>
        {ins.kind_label}
      </div>
      <div style={{
        fontSize: isName ? 16 : 14,
        color: 'var(--fg-1)',
        lineHeight: 1.55,
        fontStyle: isGap ? 'italic' : 'normal',
      }}
      // Insights contain markdown-style bold (**…**). Render minimally
      // by replacing **x** with <strong>x</strong>. Not full markdown —
      // just enough for the concept-name emphasis the prompt produces.
      dangerouslySetInnerHTML={{
        __html: renderInlineBold(ins.body),
      }}/>
    </div>
  )
}

function renderInlineBold(s: string): string {
  // Escape minimal HTML first to be safe; then re-introduce <strong>.
  const escaped = s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong style="color: var(--fg); font-weight: 500;">$1</strong>')
}
