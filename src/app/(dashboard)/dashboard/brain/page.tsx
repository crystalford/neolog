'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Entity, VideoAnalysis } from '@/types/database'

const C = {
  bg:          '#070706',
  bgSurface:   '#0e0d0b',
  bgRaised:    '#141210',
  border:      '#1e1b16',
  borderBright:'#2c2820',
  amber:       '#C8902A',
  amberDim:    '#7a5618',
  amberBright: '#E8A840',
  amberGlow:   'rgba(200,144,42,0.09)',
  textPrimary: '#EDE3CC',
  textSecond:  '#9A8E78',
  textDim:     '#5A5040',
  textDimmer:  '#2e2820',
  green:       '#4A8A60',
  blue:        '#4870A8',
  red:         '#8A4040',
  purple:      '#6A5890',
  terra:       '#8A5A38',
}

// ── Types ────────────────────────────────────────────────────────────────────

type MemoryEntry  = { id: string; title: string; logged_at: string; key_win: string | null }
type EnergyPoint  = { date: string; mood: string | null; energy: 'high' | 'medium' | 'low' | null }
type PatternItem  = { text: string; count: number }
type MarinatingIdea = { id: string; idea: string; mention_count: number; signal: string | null }
type ConflictItem = { text: string; kind: 'blocker' | 'question' | 'commitment' }

type BrainData = {
  memory: MemoryEntry[]
  projects: Entity[]
  actionItems: string[]
  energy: EnergyPoint[]
  patterns: PatternItem[]
  topEntities: Entity[]
  marinating: MarinatingIdea[]
  conflicts: ConflictItem[]
  totalSessions: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function relDate(ts: string) {
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function energyColor(e: string | null) {
  return e === 'high' ? C.green : e === 'low' ? C.red : C.amber
}

// ── Region panel wrapper ─────────────────────────────────────────────────────

function Region({
  label, sub, accent, empty, children,
}: {
  label: string; sub: string; accent: string; empty?: boolean; children?: React.ReactNode
}) {
  return (
    <div style={{ background: C.bgSurface, border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', minHeight: 230 }}>
      <div style={{ padding: '11px 15px 9px', borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${accent}`, background: `${accent}08` }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: accent, textTransform: 'uppercase' as const, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 7, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase' as const, marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ flex: 1, padding: '12px 15px', overflowY: 'auto' }}>
        {empty
          ? <div style={{ fontSize: 10, color: C.textDimmer, fontStyle: 'italic' }}>No data yet — keep recording.</div>
          : children}
      </div>
    </div>
  )
}

// ── Hippocampus — Memory ──────────────────────────────────────────────────────

function MemoryRegion({ entries }: { entries: MemoryEntry[] }) {
  return (
    <Region label="Hippocampus" sub="Episodic memory" accent={C.amber} empty={entries.length === 0}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map(e => (
          <div key={e.id} style={{ borderLeft: `1px solid ${C.amberDim}`, paddingLeft: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
              <div style={{ fontSize: 11, color: C.textPrimary, fontWeight: 600, lineHeight: 1.2, flex: 1 }}>{e.title}</div>
              <div style={{ fontSize: 8, color: C.textDimmer, letterSpacing: 1, whiteSpace: 'nowrap' as const }}>{relDate(e.logged_at)}</div>
            </div>
            {e.key_win && (
              <div style={{ fontSize: 10, color: C.amberBright, lineHeight: 1.45, fontStyle: 'italic' }}>
                &ldquo;{e.key_win}&rdquo;
              </div>
            )}
          </div>
        ))}
      </div>
    </Region>
  )
}

// ── Prefrontal Cortex — Executive ────────────────────────────────────────────

function ExecutiveRegion({ projects, actionItems }: { projects: Entity[]; actionItems: string[] }) {
  return (
    <Region label="Prefrontal Cortex" sub="Executive function" accent={C.green} empty={projects.length === 0 && actionItems.length === 0}>
      {projects.length > 0 && (
        <>
          <div style={{ fontSize: 7, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase' as const, marginBottom: 8 }}>Active projects</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {projects.slice(0, 4).map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, opacity: p.status === 'active' ? 1 : 0.35, flexShrink: 0 }} />
                <div style={{ fontSize: 11, color: p.status === 'active' ? C.textPrimary : C.textSecond, flex: 1 }}>{p.name}</div>
                <div style={{ fontSize: 8, color: C.textDimmer }}>×{p.mention_count}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {actionItems.length > 0 && (
        <>
          <div style={{ fontSize: 7, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase' as const, marginBottom: 7 }}>Open actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {actionItems.slice(0, 5).map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                <div style={{ fontSize: 8, color: C.green, flexShrink: 0, paddingTop: 2 }}>→</div>
                <div style={{ fontSize: 10, color: C.textSecond, lineHeight: 1.4 }}>{a}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </Region>
  )
}

// ── Amygdala — Emotional ─────────────────────────────────────────────────────

function EmotionalRegion({ points }: { points: EnergyPoint[] }) {
  const recent = points.slice(0, 16)
  const moods = [...new Set(points.slice(0, 6).map(p => p.mood).filter(Boolean) as string[])]
  return (
    <Region label="Amygdala" sub="Affect + energy state" accent={C.terra} empty={points.length === 0}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 7, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase' as const, marginBottom: 9 }}>
          Energy — {recent.length} sessions
        </div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 32 }}>
          {recent.map((p, i) => (
            <div key={i} title={`${relDate(p.date)} · ${p.energy ?? '?'}`} style={{
              width: 9, flexShrink: 0, borderRadius: 1,
              height: p.energy === 'high' ? 32 : p.energy === 'medium' ? 20 : p.energy === 'low' ? 10 : 5,
              background: energyColor(p.energy),
              opacity: 0.5 + (i / recent.length) * 0.5,
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
          <div style={{ fontSize: 7, color: C.textDimmer }}>oldest</div>
          <div style={{ fontSize: 7, color: C.textDimmer }}>latest</div>
        </div>
      </div>
      {moods.length > 0 && (
        <>
          <div style={{ fontSize: 7, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase' as const, marginBottom: 7 }}>Recent mood</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
            {moods.map((m, i) => (
              <span key={i} style={{ fontSize: 9, color: C.textSecond, background: C.bgRaised, border: `1px solid ${C.border}`, padding: '2px 7px' }}>{m}</span>
            ))}
          </div>
        </>
      )}
    </Region>
  )
}

// ── Cerebellum — Pattern ──────────────────────────────────────────────────────

function PatternRegion({ patterns, topEntities }: { patterns: PatternItem[]; topEntities: Entity[] }) {
  const maxCount = Math.max(...patterns.map(p => p.count), 1)
  return (
    <Region label="Cerebellum" sub="Pattern recognition" accent={C.blue} empty={patterns.length === 0 && topEntities.length === 0}>
      {patterns.length > 0 && (
        <>
          <div style={{ fontSize: 7, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase' as const, marginBottom: 9 }}>Recurring themes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {patterns.slice(0, 6).map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 10, color: C.textSecond, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.text}</div>
                <div style={{ height: 3, width: Math.max(8, (p.count / maxCount) * 48), background: C.blue, opacity: 0.6, borderRadius: 1, flexShrink: 0 }} />
                <div style={{ fontSize: 8, color: C.textDimmer, width: 18, textAlign: 'right' as const }}>{p.count}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {topEntities.length > 0 && (
        <>
          <div style={{ fontSize: 7, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase' as const, marginBottom: 7 }}>Top entities</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
            {topEntities.slice(0, 8).map(e => (
              <span key={e.id} style={{ fontSize: 9, color: C.blue, background: `${C.blue}12`, border: `1px solid ${C.blue}25`, padding: '2px 8px' }}>
                {e.name} · {e.mention_count}
              </span>
            ))}
          </div>
        </>
      )}
    </Region>
  )
}

// ── Default Mode Network — Marinating ────────────────────────────────────────

function MarinatingRegion({ ideas }: { ideas: MarinatingIdea[] }) {
  return (
    <Region label="Default Mode Network" sub="Background processing" accent={C.purple} empty={ideas.length === 0}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ideas.map(idea => (
          <div key={idea.id} style={{ padding: '8px 10px', background: C.bgRaised, border: `1px solid ${C.border}`, borderLeft: `2px solid ${C.purple}` }}>
            <div style={{ fontSize: 11, color: C.textPrimary, lineHeight: 1.35, marginBottom: 4 }}>{idea.idea}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {idea.signal && <div style={{ fontSize: 9, color: C.textDim, flex: 1 }}>{idea.signal}</div>}
              <div style={{ fontSize: 8, color: C.purple, letterSpacing: 1 }}>×{idea.mention_count}</div>
            </div>
          </div>
        ))}
      </div>
    </Region>
  )
}

// ── Anterior Cingulate — Conflict ─────────────────────────────────────────────

function ConflictRegion({ items }: { items: ConflictItem[] }) {
  const groups: Array<{ label: string; color: string; kind: ConflictItem['kind'] }> = [
    { label: 'Blockers', color: C.red, kind: 'blocker' },
    { label: 'Open questions', color: C.textDim, kind: 'question' },
    { label: 'Commitments', color: C.amberDim, kind: 'commitment' },
  ]
  return (
    <Region label="Anterior Cingulate" sub="Conflict detection" accent={C.red} empty={items.length === 0}>
      {groups.map(g => {
        const rows = items.filter(i => i.kind === g.kind).slice(0, 3)
        if (rows.length === 0) return null
        return (
          <div key={g.kind} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 7, letterSpacing: 2, color: g.color, textTransform: 'uppercase' as const, marginBottom: 6, opacity: 0.9 }}>{g.label}</div>
            {rows.map((r, i) => (
              <div key={i} style={{ fontSize: 10, color: C.textSecond, lineHeight: 1.4, marginBottom: 5, paddingLeft: 8, borderLeft: `1px solid ${g.color}40` }}>
                {r.text}
              </div>
            ))}
          </div>
        )
      })}
    </Region>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BrainPage() {
  const supabase = createClient()
  const [data, setData] = useState<BrainData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const uid = session.user.id

      const [logRes, projectRes, uploadRes, entityRes, marinatingRes, countRes] = await Promise.all([
        supabase.from('log_entries').select('id, title, logged_at, meta').eq('user_id', uid).order('logged_at', { ascending: false }).limit(6),
        supabase.from('entities').select('*').eq('user_id', uid).eq('type', 'project').in('status', ['active', 'mentioned']).order('mention_count', { ascending: false }).limit(6),
        supabase.from('video_uploads').select('id, recorded_at, created_at, analysis').eq('user_id', uid).in('status', ['processed', 'ready']).order('recorded_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(20),
        supabase.from('entities').select('*').eq('user_id', uid).order('mention_count', { ascending: false }).limit(12),
        supabase.from('marinating_ideas').select('id, idea, mention_count, signal').eq('user_id', uid).eq('promoted', false).order('mention_count', { ascending: false }).limit(8),
        supabase.from('video_uploads').select('id', { count: 'exact', head: true }).eq('user_id', uid),
      ])

      const memory: MemoryEntry[] = (logRes.data ?? []).map((e: any) => ({
        id: e.id, title: e.title, logged_at: e.logged_at, key_win: e.meta?.key_win ?? null,
      }))

      const projects = (projectRes.data ?? []) as Entity[]

      const actionItems: string[] = []
      ;(uploadRes.data ?? []).slice(0, 5).forEach((u: any) => {
        const a = u.analysis as VideoAnalysis | null
        ;(a?.action_items ?? []).forEach((item: any) => {
          const text = typeof item === 'string' ? item : item?.task
          if (text && actionItems.length < 8) actionItems.push(text)
        })
      })

      const energy: EnergyPoint[] = (uploadRes.data ?? []).map((u: any) => ({
        date: u.recorded_at ?? u.created_at,
        mood: (u.analysis as any)?.mood ?? null,
        energy: (u.analysis as any)?.energy_level ?? null,
      }))

      const themeMap: Record<string, number> = {}
      ;(uploadRes.data ?? []).forEach((u: any) => {
        const a = u.analysis as VideoAnalysis | null
        ;(a?.recurring_themes ?? []).forEach((t: string) => { themeMap[t] = (themeMap[t] ?? 0) + 1 })
      })
      const patterns = Object.entries(themeMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([text, count]) => ({ text, count }))

      const topEntities = (entityRes.data ?? []) as Entity[]

      const marinating: MarinatingIdea[] = (marinatingRes.data ?? []).map((m: any) => ({
        id: m.id, idea: m.idea, mention_count: m.mention_count, signal: m.signal,
      }))

      const conflicts: ConflictItem[] = []
      ;(uploadRes.data ?? []).slice(0, 8).forEach((u: any) => {
        const a = u.analysis as VideoAnalysis | null
        ;(a?.blockers ?? []).slice(0, 2).forEach((b: string) => { if (conflicts.length < 4) conflicts.push({ text: b, kind: 'blocker' }) })
        ;(a?.questions ?? []).slice(0, 2).forEach((q: string) => { if (conflicts.length < 8) conflicts.push({ text: q, kind: 'question' }) })
        ;(a?.commitments ?? []).slice(0, 1).forEach((c: string) => { if (conflicts.length < 10) conflicts.push({ text: c, kind: 'commitment' }) })
      })

      setData({ memory, projects, actionItems, energy, patterns, topEntities, marinating, conflicts, totalSessions: countRes.count ?? 0 })
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: "'JetBrains Mono', monospace" }}>
      {/* Header */}
      <div style={{ padding: '13px 28px', borderBottom: `1px solid ${C.border}`, background: C.bgSurface, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17, color: C.textPrimary }}>Brain</div>
          <div style={{ fontSize: 8, letterSpacing: 2, color: C.amberDim, textTransform: 'uppercase' as const }}>experimental · 6 regions</div>
        </div>
        {data && (
          <div style={{ display: 'flex', gap: 24 }}>
            {([['sessions', data.totalSessions], ['entities', data.topEntities.length], ['patterns', data.patterns.length]] as const).map(([label, val]) => (
              <div key={label} style={{ textAlign: 'right' as const }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.amberBright }}>{val}</div>
                <div style={{ fontSize: 7, letterSpacing: 2, color: C.textDimmer, textTransform: 'uppercase' as const }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, letterSpacing: 3, color: C.textDimmer, textTransform: 'uppercase' as const }}>
            Reading brain…
          </div>
        ) : data && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <MemoryRegion entries={data.memory} />
            <ExecutiveRegion projects={data.projects} actionItems={data.actionItems} />
            <EmotionalRegion points={data.energy} />
            <PatternRegion patterns={data.patterns} topEntities={data.topEntities} />
            <MarinatingRegion ideas={data.marinating} />
            <ConflictRegion items={data.conflicts} />
          </div>
        )}
      </div>
    </div>
  )
}
