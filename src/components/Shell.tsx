'use client'

/**
 * Console-direction app shell — topbar + 3-group sidebar + main + optional rail.
 *
 * Every authenticated page wraps its content in <Shell active="..."
 * breadcrumb={[...]} hot="2 active" busy={true} rail={<...>}>. The rail
 * is optional; pages that don't pass one render two-column.
 *
 * The component is a Client Component so the sidebar can render the
 * active state from `usePathname()` (no manual `active=` needed in most
 * cases — pass it only to override).
 */

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

export interface ShellProps {
  active?: NavId
  breadcrumb?: string[]
  hot?: string         // e.g. "2 active" — text inside the status chip
  busy?: boolean       // pulses the led + switches to hot color
  rail?: ReactNode     // right rail content (use <PipelineRail/> by default)
  rightExtra?: ReactNode  // extra topbar widget before status chip
  children: ReactNode
}

type NavId =
  | 'timeline' | 'console' | 'vlogs' | 'transcript' | 'threads' | 'clusters' | 'productions'
  | 'graph' | 'chat'
  | 'capture' | 'system' | 'settings'

const NAV_BY_PATH: { match: RegExp; id: NavId }[] = [
  { match: /^\/vlogs/,       id: 'vlogs' },
  { match: /^\/uploads/,     id: 'vlogs' },  // legacy
  { match: /^\/console/,     id: 'console' },
  { match: /^\/threads/,     id: 'threads' },
  { match: /^\/thread\//,    id: 'threads' },
  { match: /^\/clusters/,    id: 'clusters' },
  { match: /^\/studio/,      id: 'clusters' }, // legacy
  { match: /^\/cluster\//,   id: 'clusters' },
  { match: /^\/productions/, id: 'productions' },
  { match: /^\/projects/,    id: 'productions' }, // legacy
  { match: /^\/graph/,       id: 'graph' },
  { match: /^\/chat/,        id: 'chat' },
  { match: /^\/capture/,     id: 'capture' },
  { match: /^\/system/,      id: 'system' },
  { match: /^\/settings/,    id: 'settings' },
  { match: /^\/transcript/,  id: 'transcript' },
  { match: /^\/timeline/,    id: 'timeline' },  // legacy /timeline path
  { match: /^\/?$/,          id: 'timeline' },  // / is now the timeline
]

export default function Shell({ active, breadcrumb, hot, busy, rail, rightExtra, children }: ShellProps) {
  const pathname = usePathname() ?? '/'
  const inferred: NavId = active ?? (NAV_BY_PATH.find(n => n.match.test(pathname))?.id ?? 'console')
  return (
    <>
      <Topbar breadcrumb={breadcrumb ?? []} hot={hot} busy={busy} rightExtra={rightExtra} />
      <div className={`frame ${rail ? 'with-rail' : ''}`}>
        <Sidebar active={inferred} />
        <main className="main">{children}</main>
        {rail && <aside className="rail">{rail}</aside>}
      </div>
    </>
  )
}

function Topbar({ breadcrumb, hot, busy, rightExtra }: { breadcrumb: string[]; hot?: string; busy?: boolean; rightExtra?: ReactNode }) {
  return (
    <div className="topbar">
      <Link href="/" className="brand">
        <span className="mark"><LogoMark size={18}/></span>
        neolog
      </Link>
      {breadcrumb.length > 0 && (
        <div className="breadcrumb">
          {breadcrumb.map((c, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && <span className="slash">/</span>}
              <span className={i === breadcrumb.length - 1 ? 'last' : ''}>{c}</span>
            </span>
          ))}
        </div>
      )}
      <div className="right">
        <div className="cmd-k">
          <span className="ico">{NavIcons.Search}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Search anything · jump anywhere
          </span>
          <kbd>⌘K</kbd>
        </div>
        {rightExtra}
        <span className={`status-chip ${busy ? 'busy' : ''}`}>
          <span className="led"/>
          {hot || 'all healthy'}
        </span>
        <div className="avatar">CF</div>
      </div>
    </div>
  )
}

function Sidebar({ active }: { active: NavId }) {
  // Consolidated nav (matches the Console-design HANDOFF spec):
  //   Operate — Timeline / Vlogs / Threads / Clusters / Productions
  //   Inspect — Graph / Chat
  //   Admin   — Capture / System / Settings
  //
  // Folded in:
  //   - Console → Chat (route /console renders chat; sidebar entry is "Chat")
  //   - Uploads → folded into Vlogs (filter "All / Archived" handles the
  //     old uploads grid per HANDOFF.md). Capture is for new recordings.
  //   - Transcript → opens within Vlog detail, not standalone nav
  const operate: SidebarItem[] = [
    { id: 'timeline',    label: 'Timeline',    href: '/',            icon: 'Threads',     kbd: 'G T' },
    { id: 'vlogs',       label: 'Vlogs',       href: '/vlogs',       icon: 'Vlogs',       kbd: 'G V' },
    { id: 'threads',     label: 'Threads',     href: '/threads',     icon: 'Filter',      kbd: 'G R' },
    { id: 'clusters',    label: 'Clusters',    href: '/clusters',    icon: 'Clusters' },
    { id: 'productions', label: 'Productions', href: '/productions', icon: 'Productions' },
  ]
  const inspect: SidebarItem[] = [
    { id: 'graph',   label: 'Graph', href: '/graph',   icon: 'Graph' },
    { id: 'console', label: 'Chat',  href: '/console', icon: 'Chat',  kbd: 'G C' },
  ]
  const admin: SidebarItem[] = [
    { id: 'capture',  label: 'Capture',  href: '/capture',  icon: 'Capture', kbd: '⌘N' },
    { id: 'system',   label: 'System',   href: '/system',   icon: 'System' },
    { id: 'settings', label: 'Settings', href: '/settings', icon: 'Settings' },
  ]

  return (
    <aside className="side">
      <div className="sect">Operate</div>
      {operate.map(item => <SidebarLink key={item.id} item={item} active={active} />)}
      <div className="sect">Inspect</div>
      {inspect.map(item => <SidebarLink key={item.id} item={item} active={active} />)}
      <div className="sect">Admin</div>
      {admin.map(item => <SidebarLink key={item.id} item={item} active={active} />)}
      <div className="foot">
        <span className="avatar" style={{ width: 22, height: 22, fontSize: 10 }}>CF</span>
        crystal@neolog.ai
      </div>
    </aside>
  )
}

interface SidebarItem {
  id: NavId
  label: string
  href: string
  icon: keyof typeof NavIcons
  kbd?: string
  count?: string
  badge?: string
}

function SidebarLink({ item, active }: { item: SidebarItem; active: NavId }) {
  const isActive = item.id === active
  return (
    <Link href={item.href} className={`item ${isActive ? 'active' : ''}`}>
      <span className="ico">{NavIcons[item.icon]}</span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge && <span className="badge">{item.badge}</span>}
      {item.kbd && !item.badge && <span className="kbd">{item.kbd}</span>}
      {item.count && !item.kbd && !item.badge && <span className="count">{item.count}</span>}
    </Link>
  )
}

export function LogoMark({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 22 22" width={size} height={size} fill="none" aria-label="Neolog">
      <path d="M 3 11 Q 7 4, 11 11 T 19 11" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="3" cy="11" r="1.8" fill="currentColor" />
      <circle cx="19" cy="11" r="1.8" fill="currentColor" />
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
    curbsider:    'var(--t-1)',
    memory:       'var(--t-2)',
    form:         'var(--t-3)',
    'pack rats':  'var(--t-4)',
    voice:        'var(--t-5)',
    graph:        'var(--t-6)',
    regulation:   'var(--t-7)',
    misc:         'var(--t-8)',
  }
  return <span className="topic-dot" style={{ background: map[topic?.toLowerCase() ?? ''] || 'var(--fg-3)' }}/>
}
