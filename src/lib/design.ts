/**
 * Neolog design tokens — Console direction.
 *
 * Replaces the bone/ink/topic-territory palette with the neutral zinc system
 * documented in HANDOFF.md §4. Token names map 1:1 to the CSS custom
 * properties in globals.css so a component can use either
 * `import { BG } from '@/lib/design'` or `var(--bg-1)` interchangeably.
 *
 * Legacy `INK`, `BONE`, `TOPIC`, `STATE`, `FONT_BODY`, `FONT_MONO`,
 * `SIG` exports stay for backwards-compatibility — they alias to the new
 * tokens so older pages keep working until they're ported.
 */

export const BG = {
  bg:    '#09090b',
  bg1:   '#0d0d10',
  bg2:   '#131316',
  bg3:   '#1a1a1f',
  bg4:   '#232328',
  line:  '#1f1f24',
  line1: '#2a2a30',
  line2: '#3a3a42',
} as const

export const FG = {
  fg:  '#fafafa',
  fg1: '#e4e4e7',
  fg2: '#a1a1aa',
  fg3: '#71717a',
  fg4: '#52525b',
  fg5: '#27272a',
} as const

export const SIGNAL = {
  accent:   '#3b82f6',
  accentBg: 'rgba(59,130,246,0.10)',
  accentBd: 'rgba(59,130,246,0.30)',
  ok:       '#10b981',
  warn:     '#f59e0b',
  err:      '#ef4444',
  hot:      '#ec5f3a',
} as const

/**
 * Eight cool topic accents. Use only on cluster / thread membership.
 * Canonical "topic name → CSS variable" lookup used by TopicDot and by any
 * extraction code that needs a stable color per cluster.
 */
export const TOPIC_VAR: Record<string, string> = {
  curbsider:   'var(--t-1)',
  memory:      'var(--t-2)',
  form:        'var(--t-3)',
  'pack rats': 'var(--t-4)',
  voice:       'var(--t-5)',
  graph:       'var(--t-6)',
  regulation:  'var(--t-7)',
  misc:        'var(--t-8)',
}

export const TOPIC = {
  t1: '#60a5fa',
  t2: '#a78bfa',
  t3: '#34d399',
  t4: '#fb923c',
  t5: '#f472b6',
  t6: '#2dd4bf',
  t7: '#fbbf24',
  t8: '#c084fc',
  // legacy names → nearest hue
  brass:  '#60a5fa',
  terra:  '#fb923c',
  ochre:  '#fbbf24',
  rose:   '#f472b6',
  plum:   '#a78bfa',
  violet: '#a78bfa',
  steel:  '#2dd4bf',
  teal:   '#2dd4bf',
  sage:   '#34d399',
  moss:   '#34d399',
} as const

export const FONT_BODY = "'Geist', system-ui, -apple-system, sans-serif"
export const FONT_MONO = "'Geist Mono', ui-monospace, monospace"

// ─── Legacy aliases (do not use in new code) ───────────────────────────────
export const INK = {
  bg:   BG.bg,
  ink:  BG.bg,
  ink1: BG.bg1,
  ink2: BG.bg2,
  ink3: BG.bg3,
  ink4: BG.bg4,
  line:       BG.line,
  lineWarm:   BG.line1,
  lineBright: BG.line2,
} as const

export const BONE = {
  bone:  FG.fg,
  bone1: FG.fg1,
  bone2: FG.fg2,
  bone3: FG.fg3,
  bone4: FG.fg4,
  bone5: FG.fg5,
} as const

export const STATE = {
  ok:   SIGNAL.ok,
  warn: SIGNAL.warn,
  err:  SIGNAL.err,
  hot:  SIGNAL.hot,
} as const

export const SIG = {
  sig:     SIGNAL.accent,
  sigSoft: SIGNAL.accentBg,
  sigGlow: SIGNAL.accentBd,
} as const

/**
 * Legacy helper kept for components/cards.tsx — returns a CSS color for a
 * topic name. New code should use the TOPIC_VAR map and CSS variables.
 */
export function topicColorFor(name: string): string {
  const k = name.toLowerCase()
  const v = TOPIC_VAR[k]
  if (v) {
    // strip the var() wrapping → return the literal so non-CSS contexts can use it
    const m = v.match(/var\((--t-\d)\)/)
    if (m) {
      const t = m[1]
      const key = (t.replace('-', '').toLowerCase()) as keyof typeof TOPIC
      return (TOPIC as any)[key] ?? TOPIC.t8
    }
  }
  return TOPIC.t8
}
