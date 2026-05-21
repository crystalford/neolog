'use client'

/**
 * Entity detail — canon rebuild per
 * /tmp/neolognextlevel/design-reference/07-Entity.html
 *
 * Sections:
 *   1. Crumbs (Timeline / Graph / entity name)
 *   2. Hero — 200px glyph (gradient initials by entity_type) + name h1
 *             + type/alias gloss + actions column
 *   3. Digest — 5-cell strip (mentions / threads / clusters / co-mentions / aliases)
 *   4. Mentions timeline — horizontal axis with monthly markers + dots
 *                          per mention, sized by clustering density
 *   5. Body grid — threads list + verbatim quotes (main) +
 *                  clusters appears in + co-mention heat map (rail)
 *   6. Provenance + footer
 *
 * Data: /api/v2/entities/[id].
 */

export const runtime = 'edge'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'
import { truncate, formatFullDate } from '@/components/threadkit'

interface EntityCore { id: string; name: string; type: string; aliases: string[]; mention_count: number; first_seen: string }
interface MentionRow { id: string; source_kind: string; source_id: string; time: number | null; sentence_index: number | null; at: string }
interface ThreadRow { id: string; topic: string; take: string | null; abstracted_topic: string | null; strength: number | null; extracted_at: string; vlog_id: string; vlog_filename: string | null }
interface ClusterRow { id: string; topic: string; abstracted_topic: string | null; ripeness_score: number | null; thread_count: number }
interface CoMention { id: string; name: string; entity_type: string; mention_count: number | null; shared_vlogs: number }
interface Payload {
  entity: EntityCore
  mentions: MentionRow[]
  threads: ThreadRow[]
  clusters: ClusterRow[]
  co_mentions: CoMention[]
  counts: { mentions: number; threads: number; clusters: number; co_mentioned: number }
}

const TYPE_GLYPH_GRADIENT: Record<string, { a: string; b: string }> = {
  person:  { a: 'var(--t-rose)',   b: 'var(--t-violet)' },
  place:   { a: 'var(--t-sage)',   b: 'var(--t-moss)' },
  project: { a: 'var(--t-plum)',   b: 'var(--t-violet)' },
  tool:    { a: 'var(--t-steel)',  b: 'var(--t-teal)' },
  concept: { a: 'var(--t-ochre)',  b: 'var(--t-brass)' },
  theme:   { a: 'var(--t-terra)',  b: 'var(--t-rose)' },
}

export default function EntityDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/v2/entities/${params.id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: any) => setData(d as Payload))
      .catch(e => setError(String(e?.message || e)))
  }, [params.id])

  // Compute monthly bins for mentions timeline
  const timelineBins = useMemo(() => {
    if (!data || data.mentions.length === 0) return null
    const times = data.mentions.map(m => new Date(m.at).getTime()).filter(Number.isFinite)
    if (times.length === 0) return null
    const lo = Math.min(...times)
    const hi = Math.max(...times)
    const span = Math.max(86400000, hi - lo)
    return { lo, hi, span, points: data.mentions.map(m => ({ id: m.id, pos: (new Date(m.at).getTime() - lo) / span })) }
  }, [data])

  if (error) return (
    <Shell>
      <CanonCrumbs trail={[{ label: 'Timeline', href: '/' }, { label: 'Graph', href: '/graph' }, 'Entity · error']}/>
      <div style={{ padding: 40, color: 'var(--t-terra)' }}>Error: {error}</div>
    </Shell>
  )
  if (!data) return (
    <Shell>
      <CanonCrumbs trail={[{ label: 'Timeline', href: '/' }, { label: 'Graph', href: '/graph' }, 'Entity · loading…']}/>
      <div style={{ padding: 40, color: 'var(--fg-3)' }}>Loading…</div>
    </Shell>
  )

  const { entity } = data
  const grad = TYPE_GLYPH_GRADIENT[entity.type] || { a: 'var(--t-violet)', b: 'var(--t-teal)' }
  const initials = entity.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <Shell>
      <CanonCrumbs
        trail={[
          { label: 'Timeline', href: '/' },
          { label: 'Graph', href: '/graph' },
          { label: truncate(entity.name, 50) },
        ]}
      />

      {/* Hero with glyph */}
      <section className="canon-detail-hero canon-reveal d2" style={{ gridTemplateColumns: '200px 1fr 240px', gap: 36 }}>
        <div style={{
          width: 200, height: 200, borderRadius: 24,
          background: `linear-gradient(135deg, ${grad.a}, ${grad.b})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-body)', fontWeight: 300,
          fontSize: 84, color: 'var(--bg)',
          letterSpacing: '-3px',
          boxShadow: `0 0 60px color-mix(in srgb, ${grad.a} 30%, transparent)`,
        }}>
          {initials}
        </div>
        <div>
          <div className="pills-row">
            <span className="topic-pill" style={{ '--topic': grad.a, '--topic-soft': `color-mix(in srgb, ${grad.a} 12%, transparent)` } as any}>
              <span className="type">Entity</span>
              <span className="sep">·</span>
              {entity.type}
            </span>
            {entity.aliases.length > 0 && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.4,
                textTransform: 'uppercase', color: 'var(--fg-3)',
              }}>
                also: {entity.aliases.slice(0, 3).join(', ')}{entity.aliases.length > 3 ? ` +${entity.aliases.length - 3}` : ''}
              </span>
            )}
          </div>
          <h1>{entity.name}</h1>
          <div className="meta-strip">
            <span><strong>{entity.mention_count.toLocaleString()}</strong> mentions</span>
            <span><strong>{data.threads.length}</strong> threads</span>
            <span><strong>{data.clusters.length}</strong> clusters</span>
            <span>First seen <strong>{formatFullDate(entity.first_seen)}</strong></span>
          </div>
        </div>
        <div className="actions">
          <Link className="action primary" href={`/graph`}>
            See in graph
            <span style={{ color: 'rgba(6,23,53,0.5)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>G</span>
          </Link>
          <button className="action" onClick={() => {
            navigator.clipboard?.writeText(`${location.origin}/entity/${entity.id}`).catch(() => {})
          }}>Copy link</button>
        </div>
      </section>

      {/* Digest */}
      <section className="canon-digest canon-reveal d3" style={{
        gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 32,
      }}>
        <DigestCell n={data.counts.mentions} l="Mentions"/>
        <DigestCell n={data.counts.threads} l="Threads"/>
        <DigestCell n={data.counts.clusters} l="Clusters"/>
        <DigestCell n={data.counts.co_mentioned} l="Co-mentioned"/>
        <DigestCell n={entity.aliases.length} l="Aliases"/>
      </section>

      {/* Mentions timeline */}
      {timelineBins && timelineBins.points.length > 0 && (
        <section className="canon-section canon-reveal d4" style={{ marginBottom: 32 }}>
          <div className="canon-section-head">
            <h2>Mentions timeline <span className="meta">· {data.mentions.length} over {humanSpan(timelineBins.span)}</span></h2>
            <div className="meta">first → most recent</div>
          </div>
          <div style={{
            padding: '36px 28px',
            background: 'var(--bg-1)',
            border: '1px solid var(--line-1)',
            borderRadius: 10,
            position: 'relative',
            height: 100,
          }}>
            <div style={{
              position: 'absolute', left: 28, right: 28,
              top: 50, height: 1,
              background: 'linear-gradient(90deg, transparent, var(--line-2) 10%, var(--line-2) 90%, transparent)',
            }}/>
            {timelineBins.points.map((p, i) => (
              <span key={p.id} style={{
                position: 'absolute',
                left: `calc(28px + ${p.pos} * (100% - 56px))`,
                top: 44,
                width: 12, height: 12,
                borderRadius: '50%',
                background: grad.a,
                boxShadow: `0 0 6px color-mix(in srgb, ${grad.a} 60%, transparent)`,
                opacity: 0.7 + 0.3 * (i / timelineBins.points.length),
                transform: 'translateX(-6px)',
              }}/>
            ))}
            <div style={{
              position: 'absolute', left: 28, right: 28,
              bottom: 12,
              display: 'flex', justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)', fontSize: 9.5,
              letterSpacing: 1.4, textTransform: 'uppercase',
              color: 'var(--fg-3)',
            }}>
              <span>{formatFullDate(new Date(timelineBins.lo).toISOString())}</span>
              <span>{formatFullDate(new Date(timelineBins.hi).toISOString())}</span>
            </div>
          </div>
        </section>
      )}

      {/* Body grid */}
      <div className="canon-detail-body">
        <div className="canon-detail-main">

          {/* Verbatim mentions (threads) */}
          {data.threads.length > 0 && (
            <section className="canon-section">
              <div className="canon-section-head">
                <h2>Where it appears <span className="meta">· {data.threads.length} threads</span></h2>
              </div>
              <div className="canon-siblings">
                {data.threads.slice(0, 12).map(t => {
                  const c = topicColor(t.abstracted_topic ?? t.topic)
                  return (
                    <Link key={t.id} href={`/thread/${t.id}`} className="canon-sibling" style={{ '--c': c } as any}>
                      <span className="dot"/>
                      <span className="name">{truncate(t.take || t.topic, 90)}</span>
                      <span style={{ fontSize: 10, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                        {t.abstracted_topic && truncate(t.abstracted_topic, 18)}
                      </span>
                      <span className="strength">
                        {[1,2,3,4,5].map(i => <span key={i} className={`pip ${i <= (t.strength ?? 0) ? 'on' : ''}`}/>)}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {data.threads.length === 0 && (
            <div className="canon-empty-hint">
              No threads mention this entity yet. Either it surfaced in extraction without
              being threaded, or it's a brand-new entity from a recent vlog.
            </div>
          )}
        </div>

        {/* Rail */}
        <aside className="canon-detail-rail">
          {data.clusters.length > 0 && (
            <div className="rail-card">
              <div className="rc-head">
                <h3>Clusters appears in</h3>
                <span className="more">{data.clusters.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.clusters.slice(0, 6).map(c => {
                  const topicC = topicColor(c.abstracted_topic ?? c.topic)
                  const ripe = Math.round(c.ripeness_score ?? 0)
                  return (
                    <Link key={c.id} href={`/studio/${c.id}`} className="canon-sibling" style={{ '--c': topicC } as any}>
                      <span className="dot"/>
                      <span className="name">{truncate(c.abstracted_topic ?? c.topic, 32)}</span>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10,
                        color: ripe >= 70 ? 'var(--sig)' : 'var(--fg-3)',
                        flexShrink: 0,
                      }}>{ripe} ripe</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {data.co_mentions.length > 0 && (
            <div className="rail-card">
              <div className="rc-head">
                <h3>Co-mentioned</h3>
                <span className="more">{data.co_mentions.length}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.co_mentions.slice(0, 12).map(co => (
                  <Link key={co.id} href={`/entity/${co.id}`} className="canon-entity-chip">
                    <span className="glyph">{co.name.slice(0, 2).toUpperCase()}</span>
                    {truncate(co.name, 22)}
                    {co.shared_vlogs > 1 && <span className="n">·{co.shared_vlogs}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {entity.aliases.length > 0 && (
            <div className="rail-card">
              <div className="rc-head"><h3>Aliases</h3></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {entity.aliases.map(a => (
                  <span key={a} style={{
                    padding: '4px 10px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--line-1)',
                    borderRadius: 100,
                    fontSize: 11.5, color: 'var(--fg-1)',
                  }}>{a}</span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Provenance */}
      <section className="canon-prov-grid" style={{ marginTop: 32 }}>
        <ProvCell label="First seen" value={formatFullDate(entity.first_seen)}/>
        <ProvCell label="Type" value={entity.type}/>
        <ProvCell label="Mentions" value={`${entity.mention_count}`}/>
        <ProvCell label="Entity id" value={truncate(entity.id, 22)} mono/>
      </section>

      <footer className="canon-detail-footer">
        <span>neolog · entity {truncate(entity.id, 22)}</span>
        <span/>
      </footer>
    </Shell>
  )
}

type CrumbItem = { label: string; href?: string } | string
function CanonCrumbs({ trail }: { trail: CrumbItem[] }) {
  return (
    <div className="canon-crumbs">
      {trail.map((c, i) => {
        const isLast = i === trail.length - 1
        const item = typeof c === 'string' ? { label: c } : c
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
            {item.href && !isLast ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span className={isLast ? 'here' : ''}>{item.label}</span>
            )}
            {!isLast && <span className="sep">/</span>}
          </span>
        )
      })}
      <div className="spacer"/>
    </div>
  )
}

function DigestCell({ n, l }: { n: number; l: string }) {
  return (
    <div className="canon-digest-cell">
      <span className="n">{n.toLocaleString()}</span>
      <span className="l">{l}</span>
    </div>
  )
}

function ProvCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="canon-prov-cell">
      <span className="l">{label}</span>
      <span className={`v ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  )
}

function humanSpan(ms: number): string {
  const days = ms / 86400000
  if (days < 1) return 'today'
  if (days < 7) return `${Math.round(days)} days`
  if (days < 30) return `${Math.round(days / 7)} weeks`
  if (days < 365) return `${Math.round(days / 30)} months`
  return `${(days / 365).toFixed(1)} years`
}
