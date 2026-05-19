/**
 * Thread detail. Quote-shaped page: transcript span, the take, key quotes,
 * cluster membership, related threads on the same abstracted_topic, and
 * the source vlog with a playback jump.
 */
'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'

interface ThreadDetail {
  id: string
  topic: string
  abstracted_topic: string | null
  take: string
  key_quotes: string[]
  questions_raised: string[]
  register: string | null
  strength: number | null
  transcript_span_start: number | null
  transcript_span_end: number | null
  cluster_id: string | null
  extracted_at: string
  extraction_prompt_version: string
  vlog: { id: string; original_filename: string | null; recorded_at: string | null; thumbnail_url: string | null }
}

interface ClusterRow { id: string; name: string | null; abstracted_topic: string | null }
interface ConnectionRow { thread_a_id: string; thread_b_id: string; connection_type: string; confidence: number | null }
interface RelatedRow { id: string; topic: string; take: string | null; vlog_id: string; extracted_at: string }

interface Resp {
  thread: ThreadDetail
  cluster: ClusterRow | null
  connections: ConnectionRow[]
  related: RelatedRow[]
  transcript_excerpt: string
}

export default function ThreadDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Resp | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/v2/threads/${params.id}`, { credentials: 'include' })
      .then(async (r: any) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: Resp) => setData(d))
      .catch(e => setError(String(e.message || e)))
  }, [params.id])

  if (error) return (
    <Shell active="threads" breadcrumb={['Threads', 'Error']}>
      <div className="pad"><div className="card" style={{ color: 'var(--err)' }}>Error: {error}</div></div>
    </Shell>
  )
  if (!data) return (
    <Shell active="threads" breadcrumb={['Threads', 'Loading…']}>
      <div className="pad"><div style={{ color: 'var(--fg-3)' }}>Loading…</div></div>
    </Shell>
  )

  const t = data.thread
  const topicLabel = t.abstracted_topic || t.topic
  const topicVar = `var(--t-${topicTokenFor(topicLabel || '')})`
  const sourceLabel = t.transcript_span_start != null
    ? `${Math.floor(t.transcript_span_start / 60)}:${String(Math.floor(t.transcript_span_start % 60)).padStart(2, '0')}`
    : null
  const breadcrumbTail = (topicLabel || 'Thread').slice(0, 30)

  return (
    <Shell active="threads" breadcrumb={['Threads', breadcrumbTail]}>
      <div className="pad" style={{ maxWidth: 880, marginLeft: 'auto', marginRight: 'auto' }}>
        <div className="kicker" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: topicVar }} />
          <span className="mono" style={{ fontSize: 11, letterSpacing: 0.4, color: 'var(--fg-3)', textTransform: 'uppercase' }}>
            Thread · {topicLabel}
            {t.register ? ` · ${t.register}` : ''}
          </span>
        </div>

        <h1 style={{ fontWeight: 500, fontSize: 28, letterSpacing: '-0.6px', lineHeight: 1.18, marginBottom: 18 }}>
          {t.take}
        </h1>

        {t.strength != null && (
          <div style={{ marginBottom: 20, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 0.5, color: 'var(--fg-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>STRENGTH</span>
            <span style={{ display: 'inline-flex', gap: 3 }}>
              {[0, 1, 2, 3, 4].map(i => (
                <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i < (t.strength ?? 0) ? topicVar : 'var(--bg-4)' }} />
              ))}
            </span>
          </div>
        )}

        {t.key_quotes.length > 0 && (
          <div className="section" style={{ marginTop: 24 }}>
            <div className="label">Key quotes ({t.key_quotes.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {t.key_quotes.map((q, i) => (
                <blockquote key={i} style={{
                  fontSize: 15, lineHeight: 1.55, color: 'var(--fg)',
                  padding: '12px 16px',
                  background: 'var(--bg-1)',
                  borderLeft: `2px solid ${topicVar}`,
                  borderRadius: 8,
                  margin: 0,
                }}>{q}</blockquote>
              ))}
            </div>
          </div>
        )}

        {t.questions_raised.length > 0 && (
          <div className="section" style={{ marginTop: 24 }}>
            <div className="label">Questions raised</div>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8, margin: 0 }}>
              {t.questions_raised.map((q, i) => (
                <li key={i} style={{ fontSize: 14, color: 'var(--fg-1)', lineHeight: 1.55, paddingLeft: 16, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, color: 'var(--fg-4)' }}>?</span>
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.transcript_excerpt && (
          <div className="section" style={{ marginTop: 24 }}>
            <div className="label">Transcript excerpt</div>
            <div style={{
              fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6,
              background: 'var(--bg-1)', border: '1px solid var(--line)',
              borderRadius: 8, padding: '12px 16px',
              maxHeight: 200, overflow: 'auto',
            }}>
              {data.transcript_excerpt}
            </div>
            {sourceLabel && (
              <Link href={`/timeline/${t.vlog.id}#t=${t.transcript_span_start}`} className="btn ghost small" style={{ marginTop: 10 }}>
                Jump to {sourceLabel} in source vlog →
              </Link>
            )}
          </div>
        )}

        {data.cluster && (
          <div className="section" style={{ marginTop: 24 }}>
            <div className="label">Cluster</div>
            <Link href={`/cluster/${data.cluster.id}`} className="card" style={{ display: 'block', padding: 14 }}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                Cluster
              </div>
              <div style={{ fontSize: 14, color: 'var(--fg)', fontWeight: 500 }}>
                {data.cluster.name || data.cluster.abstracted_topic || '(unnamed)'}
              </div>
            </Link>
          </div>
        )}

        {data.related.length > 0 && (
          <div className="section" style={{ marginTop: 24 }}>
            <div className="label">Related threads on the same topic ({data.related.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.related.map(r => (
                <Link key={r.id} href={`/thread/${r.id}`} className="card" style={{ display: 'block', padding: 12 }}>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
                    Thread · {new Date(r.extracted_at).toLocaleDateString()}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.5 }}>
                    {r.take ? `"${r.take.slice(0, 180)}"` : r.topic}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {data.connections.length > 0 && (
          <div className="section" style={{ marginTop: 24 }}>
            <div className="label">Connections ({data.connections.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {data.connections.map((c, i) => {
                const peer = c.thread_a_id === t.id ? c.thread_b_id : c.thread_a_id
                return (
                  <Link key={`${c.thread_a_id}-${c.thread_b_id}-${i}`} href={`/thread/${peer}`}
                        className="pill mute" style={{ textDecoration: 'none' }}>
                    {c.connection_type.replace(/_/g, ' ')}
                    {c.confidence != null && (
                      <span className="mono" style={{ marginLeft: 6, color: 'var(--fg-4)' }}>
                        {(c.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        <div className="section" style={{ marginTop: 24 }}>
          <div className="label">Source</div>
          <Link href={`/timeline/${t.vlog.id}`} className="card" style={{ display: 'flex', gap: 12, padding: 12, alignItems: 'center' }}>
            <div style={{
              width: 80, aspectRatio: '16/10', flexShrink: 0,
              borderRadius: 6,
              background: t.vlog.thumbnail_url ? `center/cover no-repeat url(${t.vlog.thumbnail_url})` : 'var(--bg-2)',
              border: '1px solid var(--line)',
            }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Vlog{sourceLabel ? ` · ${sourceLabel}` : ''}
              </div>
              <div style={{ fontSize: 14, color: 'var(--fg)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.vlog.original_filename?.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') || 'Untitled'}
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>
                {t.vlog.recorded_at ? new Date(t.vlog.recorded_at).toLocaleDateString() : ''}
              </div>
            </div>
          </Link>
        </div>

        <div className="section" style={{ marginTop: 24, marginBottom: 32 }}>
          <div className="label">Provenance</div>
          <div className="mono" style={{
            fontSize: 10, letterSpacing: 1, color: 'var(--fg-3)',
            background: 'var(--bg-1)', border: '1px solid var(--line)',
            borderRadius: 8, padding: '10px 14px',
          }}>
            Extracted {new Date(t.extracted_at).toLocaleString()} · prompt {t.extraction_prompt_version}
          </div>
        </div>
      </div>
    </Shell>
  )
}

function topicTokenFor(text: string): string {
  const tokens = ['brass', 'terra', 'ochre', 'rose', 'plum', 'violet', 'steel', 'teal', 'sage', 'moss']
  let h = 0
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0
  return tokens[Math.abs(h) % tokens.length]
}
