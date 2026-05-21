'use client'

/**
 * Canon masthead — top-horizontal nav.
 *
 * Source: /tmp/neolognextlevel/design-reference/00-Sitemap.html (lines 49-67).
 * Three-column grid: lockup | 5-entry nav | search + health + avatar.
 *
 * The 5 surfaces in the masthead are the canon's primary destinations:
 *   Timeline · Studio · Graph · Productions · About
 *
 * Chat, Capture, Settings, Signout live in the avatar dropdown.
 * Capture also has a floating fab + ⌘N for one-click access.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV: { label: string; href: string; matchPaths: RegExp[] }[] = [
  { label: 'Timeline',    href: '/',            matchPaths: [/^\/$/, /^\/timeline/, /^\/threads/, /^\/thread\//] },
  { label: 'Inbox',       href: '/inbox',       matchPaths: [/^\/inbox/] },
  { label: 'Vlogs',       href: '/vlogs',       matchPaths: [/^\/vlogs/, /^\/uploads/, /^\/vlog\//, /^\/capture/, /^\/transcript/] },
  { label: 'Studio',      href: '/studio',      matchPaths: [/^\/studio/, /^\/clusters/, /^\/cluster\//] },
  { label: 'Productions', href: '/productions', matchPaths: [/^\/productions/, /^\/projects/, /^\/materialize/, /^\/library/, /^\/entity/, /^\/graph/] },
  { label: 'Chat',        href: '/chat',        matchPaths: [/^\/chat/, /^\/console/] },
  { label: 'About',       href: '/about',       matchPaths: [/^\/about/] },
]

export function Masthead({ onCmdK }: { onCmdK?: () => void }) {
  const pathname = usePathname() ?? '/'
  return (
    <header className="canon-masthead">
      <Link href="/" className="canon-lockup">
        <span className="mark">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M 3 16 Q 9 4, 16 16 T 29 16" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round"/>
            <circle cx="3" cy="16" r="2.4" fill="currentColor"/>
            <circle cx="29" cy="16" r="2.4" fill="currentColor"/>
          </svg>
        </span>
        <span className="wordmark">neolog</span>
      </Link>

      <nav className="canon-nav">
        {NAV.map(item => {
          const isActive = item.matchPaths.some(rx => rx.test(pathname))
          return (
            <Link key={item.href} href={item.href} className={isActive ? 'current' : ''}>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="canon-meta">
        <button className="canon-search" onClick={() => onCmdK?.()} aria-label="Open search palette">
          <svg viewBox="0 0 14 14"><circle cx="6" cy="6" r="4.5"/><path d="M9.5 9.5 L13 13"/></svg>
          <span>Search anything · jump anywhere</span>
          <span className="kbd">⌘K</span>
        </button>
        <HealthPill/>
        <AvatarMenu/>
      </div>
    </header>
  )
}

/** Health pill — polls /api/v2/system/status. Cobalt = healthy, ochre = degraded, terra = down. */
function HealthPill() {
  const [state, setState] = useState<'ok' | 'warn' | 'err' | 'unknown'>('unknown')

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const r = await fetch('/api/v2/system/status', { cache: 'no-store' })
        if (cancelled) return
        if (r.ok) {
          const d = await r.json().catch(() => null) as { services?: { state?: string }[] } | null
          if (d && Array.isArray(d.services)) {
            const hasErr = d.services.some(s => s.state === 'err' || s.state === 'down')
            const hasWarn = d.services.some(s => s.state === 'warn' || s.state === 'degraded')
            setState(hasErr ? 'err' : hasWarn ? 'warn' : 'ok')
          } else {
            setState('ok')
          }
        } else {
          setState('warn')
        }
      } catch {
        if (!cancelled) setState('warn')
      }
    }
    check()
    const id = setInterval(check, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const label = state === 'err' ? 'degraded' : state === 'warn' ? 'checking' : 'all healthy'
  const cls = state === 'err' ? 'canon-health err' : state === 'warn' ? 'canon-health warn' : 'canon-health'
  return <span className={cls}>{label}</span>
}

/** Avatar + dropdown menu. Chat / Capture / Settings / Signout live here. */
function AvatarMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="canon-avatar" onClick={() => setOpen(v => !v)} aria-label="Account menu">
        CF
      </button>
      {open && (
        <div className="canon-dropdown" role="menu">
          <Link href="/chat" onClick={() => setOpen(false)}>
            <span>Chat</span>
            <span className="kbd">G C</span>
          </Link>
          <Link href="/vlogs?capture=open" onClick={() => setOpen(false)}>
            <span>Drop a vlog</span>
            <span className="kbd">⌘N</span>
          </Link>
          <Link href="/settings" onClick={() => setOpen(false)}>
            <span>Settings</span>
          </Link>
          <div className="sep"/>
          <a href="/cdn-cgi/access/logout">
            <span>Sign out</span>
          </a>
        </div>
      )}
    </div>
  )
}
