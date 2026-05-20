/**
 * Hash arbitrary topic / category strings into one of the 8 topic
 * accent slots defined in globals.css (--t-1 … --t-8). Used across
 * Timeline, Threads, Clusters, Vlogs to give cards a topic-colored
 * left spine without a hand-curated mapping.
 *
 * The same input always produces the same slot, so a recurring topic
 * across vlogs reads as one visual thread.
 */
export function topicColor(topic?: string | null): string {
  const t = (topic ?? '').trim().toLowerCase()
  if (!t) return 'var(--fg-3)'
  let h = 0
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0
  return `var(--t-${(h % 8) + 1})`
}

/**
 * Editorial uppercase-mono metadata label styling. Use as the
 * `style={...}` on a span carrying the "Thread · observation" or
 * "Vlog" or "Clip · 0:00 → 0:12" eyebrow above a card's content.
 *
 * Pass the topic/spine color as `color`; the rest of the typography
 * is consistent across surfaces so the visual vocabulary stays one
 * voice.
 */
export function editorialLabel(color: string): React.CSSProperties {
  return {
    fontSize: 10,
    color,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: 600,
    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
  }
}

/** Common card padding + topic-spine style for editorial cards. */
export function editorialCard(color: string): React.CSSProperties {
  return {
    padding: '18px 22px',
    display: 'block',
    borderLeft: `3px solid ${color}`,
  }
}

// React types imported lazily so this file can be used from edge runtime
// pages without bundling React's full type surface.
import type React from 'react'
