'use client'

/**
 * Canon app shell — top-horizontal masthead + main.
 *
 * Replaces the older sidebar-based shell. Wraps `<Masthead/>` over the
 * page content. The `active`/`breadcrumb`/`hot`/`busy`/`rail` props are
 * preserved so existing pages still compile, but they're no-ops now —
 * masthead infers active state from pathname, and per-surface rails
 * are rendered inside each page's content (canon pattern).
 *
 * NavIcons / LogoMark / Pips / TopicDot remain exported for backward
 * compatibility with pages that imported them from here.
 *
 * Source: /tmp/neolognextlevel/design-reference/00-Sitemap.html
 */

import { ReactNode } from 'react'
import { Masthead } from './Masthead'

export interface ShellProps {
  active?: string
  breadcrumb?: string[]
  hot?: string
  busy?: boolean
  rail?: ReactNode
  rightExtra?: ReactNode
  children: ReactNode
}

/** Trigger the global CmdK palette by dispatching a synthetic ⌘K keydown.
 *  CmdK is mounted globally in `app/(app)/layout.tsx` and listens for the
 *  shortcut itself, so any button can open it without prop-drilling. */
function triggerCmdK() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
}

export default function Shell({ children }: ShellProps) {
  return (
    <div className="canon-page">
      <div className="canon-wrap">
        <Masthead onCmdK={triggerCmdK}/>
        <main className="canon-main">
          {children}
        </main>
      </div>
    </div>
  )
}

/* ─── Backward-compat exports ────────────────────────────────────────
 * The 17 pages currently importing from `@/components/Shell` use these
 * helpers. Keep them here until each page ports to threadkit/cards or
 * an explicit per-component import. */

export function LogoMark({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-label="Neolog">
      <path d="M 3 16 Q 9 4, 16 16 T 29 16" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round" />
      <circle cx="3" cy="16" r="2.4" fill="currentColor" />
      <circle cx="29" cy="16" r="2.4" fill="currentColor" />
    </svg>
  )
}

export const NavIcons = {
  Console:     <svg viewBox="0 0 16 16"><polyline points="3,5 6,8 3,11"/><line x1="8" y1="11" x2="13" y2="11"/></svg>,
  Vlogs:       <svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1.5"/><polygon points="7,6 11,8 7,10" fill="currentColor" stroke="none"/></svg>,
  Threads:     <svg viewBox="0 0 16 16"><line x1="3" y1="5" x2="13" y2="5"/><line x1="3" y1="8" x2="13" y2="8"/><line x1="3" y1="11" x2="13" y2="11"/><circle cx="5" cy="5" r="1.1" fill="currentColor"/><circle cx="8" cy="8" r="1.1" fill="currentColor"/><circle cx="11" cy="11" r="1.1" fill="currentColor"/></svg>,
  Clusters:    <svg viewBox="0 0 16 16"><circle cx="5" cy="5" r="2"/><circle cx="11" cy="5" r="2"/><circle cx="8" cy="11" r="2"/><line x1="6" y1="6.5" x2="7" y2="9.5"/><line x1="10" y1="6.5" x2="9" y2="9.5"/></svg>,
  Productions: <svg viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="1"/><line x1="6" y1="3" x2="6" y2="13"/><line x1="10" y1="3" x2="10" y2="13"/></svg>,
  Graph:       <svg viewBox="0 0 16 16"><circle cx="4" cy="4" r="1.7"/><circle cx="12" cy="4" r="1.7"/><circle cx="4" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="8" cy="8" r="2"/><line x1="5.5" y1="5" x2="6.5" y2="7"/><line x1="10.5" y1="5" x2="9.5" y2="7"/><line x1="5.5" y1="11" x2="6.5" y2="9"/><line x1="10.5" y1="11" x2="9.5" y2="9"/></svg>,
  Chat:        <svg viewBox="0 0 16 16"><path d="M2 4 a1.5 1.5 0 0 1 1.5 -1.5 h9 a1.5 1.5 0 0 1 1.5 1.5 v6 a1.5 1.5 0 0 1 -1.5 1.5 h-5 l-3 2.5 v-2.5 h-1 a1.5 1.5 0 0 1 -1.5 -1.5 z"/></svg>,
  System:      <svg viewBox="0 0 16 16"><path d="M8 14a6 6 0 1 0 -6 -6"/><path d="M8 5v3l2 2"/></svg>,
  Settings:    <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2"/><path d="M8 3 V5 M8 11 V13 M3 8 H5 M11 8 H13 M4.5 4.5 L6 6 M10 10 L11.5 11.5 M4.5 11.5 L6 10 M10 6 L11.5 4.5"/></svg>,
  Capture:     <svg viewBox="0 0 16 16"><path d="M8 12V3M4 7l4-4 4 4M3 14h10"/></svg>,
  Search:      <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4"/><line x1="10" y1="10" x2="13" y2="13"/></svg>,
  Plus:        <svg viewBox="0 0 16 16"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>,
  Filter:      <svg viewBox="0 0 16 16"><line x1="3" y1="5" x2="13" y2="5"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="7" y1="11" x2="9" y2="11"/></svg>,
  Sort:        <svg viewBox="0 0 16 16"><line x1="4" y1="6" x2="12" y2="6"/><line x1="6" y1="9" x2="10" y2="9"/><line x1="7.5" y1="12" x2="8.5" y2="12"/></svg>,
  Refresh:     <svg viewBox="0 0 16 16"><path d="M3 8a5 5 0 0 1 5-5 5 5 0 0 1 5 5"/><polyline points="11,1 13,3 11,5"/><path d="M13 8a5 5 0 0 1 -5 5 5 5 0 0 1 -5 -5"/><polyline points="5,15 3,13 5,11"/></svg>,
  Play:        <svg viewBox="0 0 16 16"><polygon points="5,3 12,8 5,13" fill="currentColor" stroke="none"/></svg>,
  Record:      <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4" fill="currentColor" stroke="none"/></svg>,
  External:    <svg viewBox="0 0 16 16"><polyline points="9,3 13,3 13,7"/><line x1="13" y1="3" x2="8" y2="8"/><path d="M11 9v3a1 1 0 0 1 -1 1H4a1 1 0 0 1 -1 -1V6a1 1 0 0 1 1 -1h3"/></svg>,
  ChevronDown: <svg viewBox="0 0 16 16"><polyline points="4,6 8,10 12,6"/></svg>,
  ChevronRight:<svg viewBox="0 0 16 16"><polyline points="6,4 10,8 6,12"/></svg>,
  Check:       <svg viewBox="0 0 16 16"><polyline points="3,8 6,11 13,4"/></svg>,
  Question:    <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M6 6 a2 2 0 1 1 2 2 v1"/><circle cx="8" cy="11.5" r="0.6" fill="currentColor"/></svg>,
} as const

export function Pips({ n = 0, max = 5, accent = false }: { n?: number; max?: number; accent?: boolean }) {
  return (
    <span className="pips">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={`pip ${i < n ? 'on' : ''} ${accent ? 'accent' : ''}`}/>
      ))}
    </span>
  )
}

export function TopicDot({ topic }: { topic?: string }) {
  const map: Record<string, string> = {
    curbsider:    'var(--t-steel)',
    memory:       'var(--t-plum)',
    form:         'var(--t-sage)',
    'pack rats':  'var(--t-terra)',
    voice:        'var(--t-rose)',
    graph:        'var(--t-teal)',
    regulation:   'var(--t-ochre)',
    misc:         'var(--t-violet)',
  }
  return <span className="topic-dot" style={{ background: map[topic?.toLowerCase() ?? ''] || 'var(--fg-3)' }}/>
}
