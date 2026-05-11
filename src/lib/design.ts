/**
 * Neolog design tokens — bone/ink/Geist + topic territories.
 * Source of truth: filament-update/timeline.html prototype.
 *
 * Import on every v2 surface. Do not redefine inline.
 * Legacy amber `C` object stays alive on unmigrated pages — no global find-replace.
 */

/**
 * INK — backgrounds, surfaces, borders. Warm dark, umber-tinted near-black.
 */
export const INK = {
  bg:       '#050402', // page background (deepest)
  ink:      '#100d09', // primary surface
  ink1:     '#14110d', // raised surface
  ink2:     '#1a1611', // raised surface (one step brighter)
  ink3:     '#221d16', // border / faint divider
  ink4:     '#2a231a', // border / brighter divider

  line:        '#221d16',
  lineWarm:    '#2f2820',
  lineBright:  '#403729',
} as const

/**
 * BONE — text and signal. Off-white with warmth.
 */
export const BONE = {
  bone:   '#ece4d2', // primary text
  bone1:  '#c8bea9', // secondary text
  bone2:  '#a89c84', // tertiary text
  bone3:  '#7a7160', // dimmed text
  bone4:  '#54493a', // very dim text
  bone5:  '#2e2820', // near-invisible (for label backgrounds, etc.)

  // System signal — bone, no color. Used for Surfaced cards and system messages.
  sig:      '#ece4d2',
  sigSoft:  'rgba(236,228,210,0.10)',
  sigGlow:  'rgba(236,228,210,0.30)',
} as const

/**
 * TOPIC — ten territory colors for cluster/thread tagging.
 * Each topic territory gets one of these. Assigned at cluster formation,
 * stable for the cluster's lifetime. Used for left-rules, glows, and
 * pill backgrounds on Timeline cards.
 */
export const TOPIC = {
  brass:   '#d18847',
  terra:   '#c66042',
  ochre:   '#b48b3c',
  rose:    '#b56676',
  plum:    '#8662a8',
  violet:  '#6e6cb8',
  steel:   '#4d8aa8',
  teal:    '#4d9988',
  sage:    '#7a9a6a',
  moss:    '#5e7d5e',
} as const

export type TopicTerritory = keyof typeof TOPIC

export const TOPIC_TERRITORIES: TopicTerritory[] = [
  'brass', 'terra', 'ochre', 'rose', 'plum',
  'violet', 'steel', 'teal', 'sage', 'moss',
]

/**
 * STATE — semantic colors for status, pipeline state, errors.
 * Sparingly used; bone is the default for system-side signals.
 */
export const STATE = {
  ok:    '#7a9a6a', // sage
  warn:  '#d18847', // brass
  err:   '#c66042', // terra
} as const

/**
 * Typography. Geist for body, JetBrains Mono for metadata only.
 * Syne (legacy display font) is being retired — do not use on v2 pages.
 */
export const FONT_BODY = "'Geist', system-ui, sans-serif" as const
export const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace" as const

/**
 * Body type defaults. Match the prototype's font-feature-settings + smoothing.
 */
export const BODY_DEFAULTS = {
  fontFamily: FONT_BODY,
  fontSize: 14,
  lineHeight: 1.5,
  WebkitFontSmoothing: 'antialiased',
  textRendering: 'optimizeLegibility',
  fontFeatureSettings: '"ss01" on',
} as const

/**
 * Mono label defaults — for type tags, timestamps, status text.
 */
export const MONO_LABEL = {
  fontFamily: FONT_MONO,
  fontSize: 10,
  letterSpacing: 4,
  textTransform: 'uppercase' as const,
  color: BONE.bone3,
} as const

/**
 * Topic color picker — deterministic assignment from a string seed
 * (e.g. cluster.abstracted_topic) to one of the ten territories.
 * Stable across renders for the same seed.
 */
export function topicColorFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  const idx = Math.abs(hash) % TOPIC_TERRITORIES.length
  return TOPIC[TOPIC_TERRITORIES[idx]]
}
