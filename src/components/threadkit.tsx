/**
 * threadkit — shared UI primitives used by Thread / Vlog / Cluster /
 * (eventually) every comprehensive detail page in the Console design.
 *
 * Lifted out of src/app/(app)/thread/[id]/page.tsx so the Vlog and
 * Cluster detail pages can render the same chrome without duplicating
 * 600+ lines of helper components.
 *
 * No behavior change — these components are the exact ones the Thread
 * page already shipped, just moved + exported.
 */

'use client'

import { useMemo, type CSSProperties } from 'react'
import Link from 'next/link'

// ── Type primitives shared across detail pages ───────────────────────

export interface KitWord { word: string; start_time: number; end_time: number }
export interface KitSpan { start: number | null; end: number | null }
export interface KitEntity {
  id: string
  name: string
  entity_type: string
  mention_count: number | null
}

// ── Small atomic helpers ─────────────────────────────────────────────

export function Sep() { return <span style={{ color: 'var(--fg-5)' }}>/</span> }

export function NavBtn({ disabled, onClick, label, hint }: { disabled?: boolean; onClick: () => void; label: string; hint?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '4px 9px', fontSize: 11,
      background: 'transparent', color: disabled ? 'var(--fg-5)' : 'var(--fg-2)',
      border: '1px solid var(--line)', borderRadius: 5, cursor: disabled ? 'default' : 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      {label}
      {hint && !disabled && <span style={{
        fontSize: 9, color: 'var(--fg-4)', background: 'var(--bg-2)',
        padding: '1px 4px', borderRadius: 3,
        fontFamily: 'Geist Mono, ui-monospace, monospace',
      }}>{hint}</span>}
    </button>
  )
}

export function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} style={{
      width: 28, height: 28, padding: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent', color: 'var(--fg-3)',
      border: '1px solid var(--line)', borderRadius: 5, cursor: 'pointer',
    }}>{children}</button>
  )
}

export function pillTopic(): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', padding: '5px 10px', borderRadius: 999,
    background: 'var(--bg-1)', border: '1px solid var(--line-1)',
    color: 'var(--fg-2)', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase',
    fontFamily: 'Geist Mono, ui-monospace, monospace',
  }
}

export function pillCluster(color: string): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '5px 11px', borderRadius: 999,
    background: 'var(--bg-1)', border: '1px solid var(--line-1)',
    color, textDecoration: 'none',
    fontSize: 11, letterSpacing: 0.4,
    fontFamily: 'Geist Mono, ui-monospace, monospace',
  }
}

export function editorialLabel(color: string, mb: number = 8): CSSProperties {
  return {
    fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase',
    color, fontWeight: 600,
    fontFamily: 'Geist Mono, ui-monospace, monospace',
    marginBottom: mb,
  }
}

export function Strength({ n, color, compact, max = 5 }: { n: number; color: string; compact?: boolean; max?: number }) {
  const dots = Array.from({ length: max }, (_, i) => i < n)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      {!compact && <span>Strength</span>}
      <span style={{ display: 'inline-flex', gap: 3 }}>
        {dots.map((on, i) => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: on ? color : 'var(--bg-4)',
            boxShadow: on ? `0 0 4px ${color}33` : 'none',
          }}/>
        ))}
      </span>
      {!compact && <span style={{ color, fontFamily: 'Geist, system-ui, sans-serif', fontSize: 13, textTransform: 'none', letterSpacing: '-0.2px', fontWeight: 500 }}>{n} of {max}</span>}
    </span>
  )
}

export function Meta({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <IconSpan kind={icon}/>
      {label && <span>{label}</span>}
      <b style={{ color: 'var(--fg-1)', fontWeight: 500, fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.1px', textTransform: 'none', fontSize: 12 }}>{value}</b>
    </span>
  )
}

export function IconSpan({ kind }: { kind: string }) {
  const props = { width: 11, height: 11, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 } as any
  if (kind === 'clock') return <svg {...props}><circle cx={7} cy={7} r={5}/><path d="M7 4 L7 7 L9 8"/></svg>
  if (kind === 'span')  return <svg {...props}><path d="M3 4 L11 4 L11 11 L3 11 Z M3 7 L11 7"/></svg>
  if (kind === 'lock')  return <svg {...props}><rect x={2.5} y={6} width={9} height={6} rx={1}/><path d="M4.5 6 L4.5 4 Q4.5 2 7 2 Q9.5 2 9.5 4 L9.5 6"/></svg>
  if (kind === 'doc')   return <svg {...props}><rect x={3} y={2} width={8} height={10} rx={1}/><path d="M5 5 L9 5 M5 7 L9 7 M5 9 L7 9"/></svg>
  if (kind === 'size')  return <svg {...props}><path d="M3 3 L11 3 L11 11 L3 11 Z M3 5 L11 5"/></svg>
  return null
}

export function Action({ label, hint, primary, danger, onClick, disabled, icon }: {
  label: string; hint?: string; primary?: boolean; danger?: boolean
  onClick: () => void; disabled?: boolean; icon?: React.ReactNode
}) {
  const bg = primary ? 'var(--accent)' : danger ? 'transparent' : 'var(--bg-1)'
  const color = primary ? '#061735' : danger ? 'var(--err, #f87171)' : 'var(--fg-1)'
  const border = primary ? 'none' : `1px solid ${danger ? 'var(--err, #f87171)33' : 'var(--line)'}`
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '10px 12px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      background: bg, color, border,
      borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
      fontSize: 13, fontWeight: 500,
      fontFamily: 'Geist, system-ui, sans-serif',
      opacity: disabled ? 0.5 : 1,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{icon}{label}</span>
      {hint && <span style={{
        fontSize: 10, padding: '1px 5px', borderRadius: 3,
        background: primary ? 'rgba(6,23,53,0.18)' : 'var(--bg-2)',
        color: primary ? '#061735' : 'var(--fg-3)',
        fontFamily: 'Geist Mono, ui-monospace, monospace',
      }}>{hint}</span>}
    </button>
  )
}

export function SectionBlock({ label, count, meta, children }: { label: string; count?: string; meta?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        paddingBottom: 10, marginBottom: 14,
        borderBottom: '1px solid var(--line)',
      }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--fg-1)', letterSpacing: '-0.2px' }}>
          {label}
          {count && <span style={{
            marginLeft: 10, fontSize: 11, color: 'var(--fg-3)',
            fontFamily: 'Geist Mono, ui-monospace, monospace', letterSpacing: 0.3,
          }}>{count}</span>}
        </h2>
        {meta && <span style={{
          fontSize: 10, color: 'var(--fg-4)',
          textTransform: 'uppercase', letterSpacing: 0.6,
          fontFamily: 'Geist Mono, ui-monospace, monospace',
        }}>{meta}</span>}
      </div>
      {children}
    </section>
  )
}

export function RailCard({ label, more, children }: { label: string; more: string | null; children: React.ReactNode }) {
  return (
    <div style={{ padding: 18, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 500, color: 'var(--fg-1)', letterSpacing: '-0.1px' }}>{label}</h3>
        {more && <span style={{
          fontSize: 10, color: 'var(--fg-3)', letterSpacing: 0.4,
          fontFamily: 'Geist Mono, ui-monospace, monospace', textTransform: 'uppercase',
        }}>{more} →</span>}
      </div>
      {children}
    </div>
  )
}

export function EntityChip({ entity }: { entity: KitEntity }) {
  const initials = entity.name.split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) || '?'
  const typeColor: Record<string, string> = {
    person: 'var(--t-5)', place: 'var(--t-3)', concept: 'var(--t-2)',
    tool: 'var(--t-6)', project: 'var(--t-4)', theme: 'var(--t-8)', reference: 'var(--t-1)',
  }
  const c = typeColor[entity.entity_type] ?? 'var(--fg-3)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px 4px 4px',
      background: 'var(--bg-2)', border: '1px solid var(--line)',
      borderRadius: 999,
      fontSize: 11, color: 'var(--fg-1)',
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        background: `color-mix(in srgb, ${c} 18%, var(--bg-3))`,
        color: c, fontSize: 9, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Geist Mono, ui-monospace, monospace',
      }}>{initials}</span>
      <span>{entity.name}</span>
      {entity.mention_count != null && entity.mention_count > 1 && (
        <span style={{ color: 'var(--fg-4)', fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 10 }}>·{entity.mention_count}</span>
      )}
    </span>
  )
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '12px 14px', background: 'var(--bg-2)',
      border: '1px dashed var(--line-1)', borderRadius: 6,
      fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.55,
    }}>{children}</div>
  )
}

export function Prov({ label, value, mono, link, linkText }: { label: string; value: string; mono?: boolean; link?: string; linkText?: string }) {
  return (
    <div>
      <div style={{
        fontSize: 9, color: 'var(--fg-4)',
        textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500,
        fontFamily: 'Geist Mono, ui-monospace, monospace',
        marginBottom: 3,
      }}>{label}</div>
      <div style={{
        fontSize: 12, color: 'var(--fg-1)',
        fontFamily: mono ? 'Geist Mono, ui-monospace, monospace' : 'Geist, system-ui, sans-serif',
        wordBreak: 'break-all',
      }}>
        {link
          ? <Link href={link} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{linkText ?? value}</Link>
          : value}
      </div>
    </div>
  )
}

export function Highlighted({ text, phrases, color, underline }: { text: string; phrases: string[]; color: string; underline?: boolean }) {
  if (!phrases.length) return <>{text}</>
  const sorted = [...phrases].sort((a, b) => b.length - a.length).filter(p => p && p.length >= 3)
  if (!sorted.length) return <>{text}</>
  let parts: (string | JSX.Element)[] = [text]
  for (const phrase of sorted) {
    const next: typeof parts = []
    const re = new RegExp(escapeRegex(phrase), 'i')
    for (const p of parts) {
      if (typeof p !== 'string') { next.push(p); continue }
      let remaining = p
      while (true) {
        const m = remaining.match(re)
        if (!m || m.index == null) { next.push(remaining); break }
        next.push(remaining.slice(0, m.index))
        next.push(<mark key={Math.random()} style={{
          background: underline ? 'transparent' : `linear-gradient(180deg, transparent 60%, color-mix(in srgb, ${color} 35%, transparent) 60%)`,
          color: 'var(--fg)',
          padding: underline ? 0 : '0 2px',
          borderBottom: underline ? `2px solid ${color}` : 'none',
        }}>{m[0]}</mark>)
        remaining = remaining.slice(m.index + m[0].length)
      }
    }
    parts = next
  }
  return <>{parts}</>
}

// ── Generic Wavebox — used on Thread + Vlog detail pages ───────────

export interface WaveboxBand { start: number; end: number; color: string; label?: string }

/**
 * Multi-band waveform. Thread page passes ONE band (the thread's span).
 * Vlog page passes MANY bands (each thread's span in its topic color).
 *
 * Generative sine+noise bars — no real peaks data required. Replace
 * with FFmpeg-generated peaks JSON later.
 */
export function Wavebox({
  title, subtitle, durationSec, bands, currentT, setCurrentT, playing, setPlaying, audioId, audioSrc,
  accentColor, mediaLabel,
}: {
  title: string; subtitle?: string
  durationSec: number; bands: WaveboxBand[]
  currentT: number; setCurrentT: (n: number) => void
  playing: boolean; setPlaying: (b: boolean) => void
  audioId: string; audioSrc: string | null
  accentColor: string; mediaLabel?: string
}) {
  const N = 240
  const heights = useMemo(() => {
    const h: number[] = []
    for (let i = 0; i < N; i++) {
      const env = 0.3 + 0.5 * Math.abs(Math.sin(i * 0.04))
      const noise = (Math.sin(i * 1.7) * 0.5 + Math.sin(i * 3.1) * 0.3 + Math.sin(i * 0.9) * 0.2) * 0.5 + 0.5
      h.push(Math.max(0.08, Math.min(1, env * 0.55 + noise * 0.55)))
    }
    return h
  }, [])
  const playedPct = currentT / (durationSec || 1)

  return (
    <div style={{ padding: 20, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
        <button onClick={() => {
          const a = document.getElementById(audioId) as HTMLAudioElement | null
          if (!a) return
          if (a.paused) { a.play(); setPlaying(true) } else { a.pause(); setPlaying(false) }
        }} style={{
          width: 40, height: 40, padding: 0,
          background: accentColor, color: 'var(--bg)', border: 'none', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          {playing
            ? <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="3" y="2.5" width="2.5" height="9"/><rect x="8.5" y="2.5" width="2.5" height="9"/></svg>
            : <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><polygon points="3.5,2 11.5,7 3.5,12"/></svg>}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          {mediaLabel && (
            <div style={{
              fontSize: 11, color: 'var(--fg-3)', letterSpacing: 0.4,
              fontFamily: 'Geist Mono, ui-monospace, monospace',
              marginBottom: 2, textTransform: 'uppercase',
            }}>{mediaLabel}</div>
          )}
          <div style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 10, color: 'var(--fg-4)', fontFamily: 'Geist Mono, ui-monospace, monospace' }}>
              {subtitle}
            </div>
          )}
        </div>
        <span style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'Geist Mono, ui-monospace, monospace' }}>
          {formatMmSs(currentT)} / {formatMmSs(durationSec)}
        </span>
      </div>

      <div
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const pct = (e.clientX - rect.left) / rect.width
          const target = pct * durationSec
          const a = document.getElementById(audioId) as HTMLAudioElement | null
          if (a) { a.currentTime = target; setCurrentT(target) }
        }}
        style={{ position: 'relative', height: 60, display: 'flex', alignItems: 'flex-end', gap: 1, cursor: 'pointer' }}
      >
        {heights.map((h, i) => {
          const t = i / N
          const tSec = t * durationSec
          // Find which band this bar falls in (first match wins)
          const inBand = bands.find(b => tSec >= b.start && tSec <= b.end)
          const played = t < playedPct
          const bg = inBand
            ? inBand.color
            : played
              ? `color-mix(in srgb, ${accentColor} 60%, var(--fg-5))`
              : 'var(--bg-4)'
          return (
            <div key={i} style={{
              flex: 1, height: `${h * 100}%`,
              background: bg, borderRadius: 1,
              boxShadow: inBand ? `0 0 3px ${inBand.color}80` : 'none',
            }}/>
          )
        })}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 8,
        fontSize: 9, color: 'var(--fg-4)',
        fontFamily: 'Geist Mono, ui-monospace, monospace', letterSpacing: 0.3,
      }}>
        <span>00:00</span>
        {bands.slice(0, 3).map((b, i) => (
          <span key={i} style={{ color: b.color, fontWeight: 500 }}>{formatMmSs(b.start)}</span>
        ))}
        <span>{formatMmSs(durationSec)}</span>
      </div>

      {audioSrc && (
        <audio
          id={audioId}
          src={audioSrc}
          preload="metadata"
          onTimeUpdate={(e) => setCurrentT((e.target as HTMLAudioElement).currentTime)}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          style={{ display: 'none' }}
        />
      )}
    </div>
  )
}

// ── Pure helpers ────────────────────────────────────────────────────

export function truncate(s: string | null, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
export function formatFullDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso); if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
export function formatMmSs(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60), r = Math.floor(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}
export function formatDuration(s: number): string {
  if (!isFinite(s) || s < 0) return '—'
  const m = Math.floor(s / 60), r = Math.floor(s % 60)
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`
}
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
export function insightKindLabel(k: string): string {
  return ({ name: 'Name', framework: 'Framework', parallel: 'Parallel', counter_position: 'Counter', evidence: 'Evidence', gap_question: 'Gap' } as Record<string, string>)[k] || k
}
export function renderInsightBody(body: string): string {
  const escaped = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong style="color: var(--fg); font-weight: 500;">$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

// ── RipeGauge — circular SVG ripeness display ──────────────────────

/**
 * Circular ripeness gauge. 0-100 score rendered as a stroke-dashoffset
 * arc against a track. Used in the Cluster detail page's composite
 * ripeness panel.
 */
export function RipeGauge({ score, color, max = 100, label = 'ripe', size = 180 }: {
  score: number; color: string; max?: number; label?: string; size?: number
}) {
  const clamped = Math.max(0, Math.min(max, score))
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - clamped / max)
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
        <circle cx={50} cy={50} r={radius} fill="none" stroke="var(--line-2)" strokeWidth={6}/>
        <circle cx={50} cy={50} r={radius} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.6s ease', strokeLinecap: 'round' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 2,
      }}>
        <span style={{ fontSize: 44, fontWeight: 500, color: 'var(--fg)', letterSpacing: '-1.5px', lineHeight: 1 }}>{clamped}</span>
        <span style={{
          fontSize: 11, color, letterSpacing: 0.6, textTransform: 'uppercase',
          fontFamily: 'Geist Mono, ui-monospace, monospace', fontWeight: 600, marginTop: 2,
        }}>{label}</span>
        <span style={{
          fontSize: 9, color: 'var(--fg-4)', letterSpacing: 0.4,
          fontFamily: 'Geist Mono, ui-monospace, monospace', marginTop: 1,
        }}>of {max}</span>
      </div>
    </div>
  )
}

// ── BreakdownBars — labeled horizontal bars for composite scores ──

export function BreakdownBars({ title, items, color }: {
  title?: string
  items: { name: string; value: number; hot?: boolean }[]
  color: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {title && <h4 style={{
        margin: 0, fontSize: 10, color: 'var(--fg-3)', letterSpacing: 1, textTransform: 'uppercase',
        fontFamily: 'Geist Mono, ui-monospace, monospace', fontWeight: 600,
      }}>{title}</h4>}
      {items.map((item, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 28px', gap: 10, alignItems: 'center', fontSize: 11 }}>
          <span style={{ color: 'var(--fg-2)' }}>{item.name}</span>
          <span style={{ height: 4, background: 'var(--bg-3)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
            <span style={{
              position: 'absolute', left: 0, top: 0, height: 4,
              width: `${Math.min(100, Math.max(0, item.value))}%`,
              background: item.hot ? color : 'var(--fg-3)',
              borderRadius: 2,
              boxShadow: item.hot ? `0 0 6px ${color}66` : 'none',
            }}/>
          </span>
          <span style={{
            color: 'var(--fg-1)', textAlign: 'right',
            fontFamily: 'Geist Mono, ui-monospace, monospace', fontWeight: 500,
          }}>{Math.round(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── TrajectoryChart — area chart of ripeness over time ───────────

export function TrajectoryChart({ points, color, threshold = 70, label = 'MATERIALIZE', delta }: {
  points: number[]   // 0-100 each, length = number of bins
  color: string
  threshold?: number
  label?: string
  delta?: string | null
}) {
  if (points.length < 2) {
    return (
      <div style={{ padding: 16, fontSize: 11, color: 'var(--fg-4)', textAlign: 'center' }}>
        Not enough history to chart trajectory.
      </div>
    )
  }
  const W = 240, H = 90
  // Normalize: y inverted (0 at bottom), x linear by index.
  const xs = points.map((_, i) => (i / (points.length - 1)) * W)
  const ys = points.map(p => H - (Math.max(0, Math.min(100, p)) / 100) * (H - 6))
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  const area = `${path} L ${W} ${H} L 0 ${H} Z`
  const nowX = xs[xs.length - 1]
  const nowY = ys[ys.length - 1]
  const thresholdY = H - (threshold / 100) * (H - 6)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <h4 style={{
          margin: 0, fontSize: 10, color: 'var(--fg-3)', letterSpacing: 1, textTransform: 'uppercase',
          fontFamily: 'Geist Mono, ui-monospace, monospace', fontWeight: 600,
        }}>Trajectory</h4>
        {delta && <span style={{ fontSize: 10, color: 'var(--ok)', fontFamily: 'Geist Mono, ui-monospace, monospace' }}>{delta}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
        <defs>
          <linearGradient id="trajGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35}/>
            <stop offset="100%" stopColor={color} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <path d={area} fill="url(#trajGrad)"/>
        <path d={path} stroke={color} strokeWidth={1.4} fill="none"/>
        <line x1={nowX} y1={0} x2={nowX} y2={H} stroke={color} strokeWidth={0.6} strokeDasharray="2 2" opacity={0.6}/>
        <circle cx={nowX} cy={nowY} r={3.5} fill={color}/>
        <line x1={0} y1={thresholdY} x2={W} y2={thresholdY} stroke="var(--accent)" strokeWidth={0.7} strokeDasharray="2 2" opacity={0.5}/>
        <text x={W - 4} y={thresholdY - 3} textAnchor="end" fontSize={7} fill="var(--accent)" opacity={0.7}
          fontFamily="Geist Mono, ui-monospace, monospace" letterSpacing={0.4}>{label}</text>
      </svg>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 4,
        fontSize: 9, color: 'var(--fg-4)',
        fontFamily: 'Geist Mono, ui-monospace, monospace', letterSpacing: 0.3,
      }}>
        <span>start</span>
        <span style={{ color: 'var(--fg-2)' }}>now</span>
      </div>
    </div>
  )
}

// ── RiffTimeline — horizontal axis of thread events ───────────────

export interface RiffTimelineNode {
  id: string
  /** 0-1 horizontal position (left % across the timeline) */
  position: number
  /** 1-5 strength, drives node size */
  strength: number
  /** ISO date of the thread */
  date: string
  /** Optional: highlight as the "current" node */
  current?: boolean
  /** Optional: dim weak takes */
  dim?: boolean
}

export interface RiffWindow { start: number; end: number }

export function RiffTimeline({ nodes, windows, color, weeks }: {
  nodes: RiffTimelineNode[]
  windows: RiffWindow[]
  color: string
  weeks: { position: number; label: string }[]
}) {
  if (nodes.length === 0) {
    return (
      <div style={{ padding: 16, fontSize: 11, color: 'var(--fg-4)', textAlign: 'center' }}>
        No threads in this cluster yet.
      </div>
    )
  }
  return (
    <div style={{
      position: 'relative', height: 110, padding: '36px 8px 16px',
      background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8,
    }}>
      {/* Axis */}
      <div style={{
        position: 'absolute', left: 8, right: 8, top: '50%',
        height: 1, background: 'var(--line-1)',
      }}/>
      {/* Week markers */}
      {weeks.map((w, i) => (
        <div key={i} style={{
          position: 'absolute', top: 8, left: `calc(8px + ${w.position * 100}%)`,
          fontSize: 9, color: 'var(--fg-4)', letterSpacing: 0.3,
          fontFamily: 'Geist Mono, ui-monospace, monospace',
          transform: 'translateX(-50%)', whiteSpace: 'nowrap',
        }}>
          {w.label}
        </div>
      ))}
      {/* Riff windows */}
      {windows.map((win, i) => (
        <div key={`w-${i}`} style={{
          position: 'absolute', top: '50%', height: 30, marginTop: -15,
          left: `calc(8px + ${win.start * 100}%)`,
          width: `${(win.end - win.start) * 100}%`,
          background: `${color}1f`,
          border: `1px dashed ${color}66`,
          borderRadius: 4,
        }}/>
      ))}
      {/* Thread nodes */}
      {nodes.map((n, i) => {
        const size = 6 + n.strength * 1.5
        return (
          <span key={n.id + '-' + i} title={`${n.date} · ${n.strength}/5`} style={{
            position: 'absolute', top: '50%',
            left: `calc(8px + ${n.position * 100}%)`,
            width: size, height: size,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: n.current ? 'var(--accent)' : color,
            opacity: n.dim ? 0.45 : 1,
            boxShadow: n.current ? `0 0 8px var(--accent)` : `0 0 3px ${color}80`,
            cursor: 'pointer',
          }}/>
        )
      })}
    </div>
  )
}

// ── MultiTrackTimeline — used by Vlog detail page ─────────────────

export interface MultiTrackBand {
  start: number     // seconds
  end: number       // seconds
  color: string
  label?: string
}
export interface MultiTrackMark { time: number; color: string; label?: string }

/**
 * Multi-track timeline component. Used on the Vlog detail page to
 * show audio waveform + thread spans + clip brackets + entity ticks
 * stacked as independent tracks. Click on any band or mark seeks the
 * audio/video element via the provided onSeek callback.
 */
export function MultiTrackTimeline({
  durationSec, threadBands, clipBands, entityMarks, currentT, onSeek, accentColor,
}: {
  durationSec: number
  threadBands: MultiTrackBand[]
  clipBands: MultiTrackBand[]
  entityMarks: MultiTrackMark[]
  currentT: number
  onSeek: (t: number) => void
  accentColor: string
}) {
  const N = 240
  const heights = useMemo(() => {
    const h: number[] = []
    for (let i = 0; i < N; i++) {
      const env = 0.3 + 0.5 * Math.abs(Math.sin(i * 0.04))
      const noise = (Math.sin(i * 1.7) * 0.5 + Math.sin(i * 3.1) * 0.3 + Math.sin(i * 0.9) * 0.2) * 0.5 + 0.5
      h.push(Math.max(0.08, Math.min(1, env * 0.55 + noise * 0.55)))
    }
    return h
  }, [])
  const playedPct = currentT / (durationSec || 1)

  const Track = ({ label, children, height }: { label: string; children: React.ReactNode; height: number }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 12, alignItems: 'center' }}>
      <span style={{
        fontSize: 9, color: 'var(--fg-4)', letterSpacing: 0.8, textTransform: 'uppercase',
        fontFamily: 'Geist Mono, ui-monospace, monospace', fontWeight: 600,
      }}>{label}</span>
      <div style={{
        position: 'relative', height,
        background: 'var(--bg-2)',
        border: '1px solid var(--line)',
        borderRadius: 4,
        cursor: 'pointer',
      }} onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const pct = (e.clientX - r.left) / r.width
        onSeek(pct * durationSec)
      }}>
        {children}
        {/* Playhead */}
        <span style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${playedPct * 100}%`, width: 1,
          background: accentColor, pointerEvents: 'none',
        }}/>
      </div>
    </div>
  )

  return (
    <div style={{
      padding: 16, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 10,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Audio waveform track */}
      <Track label="Audio" height={44}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 1, padding: '2px 4px' }}>
          {heights.map((h, i) => {
            const t = i / N
            const played = t < playedPct
            return (
              <div key={i} style={{
                flex: 1, height: `${h * 100}%`,
                background: played ? `color-mix(in srgb, ${accentColor} 60%, var(--fg-5))` : 'var(--bg-4)',
                borderRadius: 1,
              }}/>
            )
          })}
        </div>
      </Track>

      {/* Threads track */}
      <Track label="Threads" height={26}>
        {threadBands.map((b, i) => (
          <div key={i} title={b.label} style={{
            position: 'absolute', top: 3, bottom: 3,
            left: `${(b.start / durationSec) * 100}%`,
            width: `${((b.end - b.start) / durationSec) * 100}%`,
            background: b.color,
            borderRadius: 3,
            boxShadow: `0 0 6px ${b.color}66`,
            opacity: 0.85,
          }}/>
        ))}
      </Track>

      {/* Clips track */}
      <Track label="Clips" height={22}>
        {clipBands.map((b, i) => (
          <div key={i} title={b.label} style={{
            position: 'absolute', top: 3, bottom: 3,
            left: `${(b.start / durationSec) * 100}%`,
            width: `${Math.max(0.5, ((b.end - b.start) / durationSec) * 100)}%`,
            border: `2px solid ${b.color}`,
            borderRadius: 3,
            background: `${b.color}1f`,
          }}/>
        ))}
      </Track>

      {/* Entities track */}
      <Track label="Entities" height={20}>
        {entityMarks.map((m, i) => (
          <span key={i} title={m.label} style={{
            position: 'absolute', top: 2, bottom: 2,
            left: `${(m.time / durationSec) * 100}%`,
            width: 2, marginLeft: -1,
            background: m.color,
            opacity: 0.7,
          }}/>
        ))}
      </Track>

      {/* Time markers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '88px 1fr', gap: 12, alignItems: 'center', marginTop: 4,
      }}>
        <span/>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 9, color: 'var(--fg-4)',
          fontFamily: 'Geist Mono, ui-monospace, monospace', letterSpacing: 0.3,
        }}>
          <span>00:00</span>
          <span>{formatMmSs(durationSec * 0.25)}</span>
          <span>{formatMmSs(durationSec * 0.5)}</span>
          <span>{formatMmSs(durationSec * 0.75)}</span>
          <span>{formatMmSs(durationSec)}</span>
        </div>
      </div>
    </div>
  )
}
