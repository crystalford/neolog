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

// Two-entry masthead. The middle of the system — Subjects, Topics, the
// quick-video composer — is mechanism, not destination, and runs in the
// background. The visible product collapses to two acts: drop something
// in (Log), ship something out (Published). Detail pages for subjects /
// topics / vlogs all live downstream of Log.
const NAV: { label: string; href: string; matchPaths: RegExp[] }[] = [
  { label: 'Log',       href: '/',          matchPaths: [
    /^\/$/, /^\/vlogs/, /^\/uploads/, /^\/vlog\//, /^\/capture/, /^\/transcript/,
    /^\/photos/, /^\/photo\//,
    /^\/subjects/, /^\/subject\//, /^\/topics/, /^\/topic\//,
  ] },
  { label: 'Published', href: '/published', matchPaths: [
    /^\/published/, /^\/productions/, /^\/production\//, /^\/projects/, /^\/materialize/, /^\/library/,
  ] },
]

export function Masthead() {
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
    // Poll at 5 min (was 60s) and ONLY when the tab is visible. The status
    // check is cheap now that the FFmpeg probe is passive, but there's no
    // reason to hammer it from a backgrounded tab. visibilitychange resumes
    // an immediate check when the operator returns to the tab.
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (id != null) return
      check()
      id = setInterval(check, 300_000)
    }
    const stop = () => { if (id != null) { clearInterval(id); id = null } }
    const onVis = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
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
          <Link href="/vlogs?capture=open" onClick={() => setOpen(false)}>
            <span>Upload a vlog</span>
            <span className="kbd">⌘N</span>
          </Link>
          <Link href="/photos" onClick={() => setOpen(false)}>
            <span>Storage</span>
            <span className="dropdown-sub">your photos and videos, in date order</span>
          </Link>
          <Link href="/chat" onClick={() => setOpen(false)}>
            <span>Chat with your vlogs</span>
            <span className="kbd">G C</span>
          </Link>
          <div className="sep"/>
          {/* Lost-but-good surfaces — fully functional, brought back via dropdown
              instead of cluttering the 4-entry masthead. */}
          <Link href="/inbox" onClick={() => setOpen(false)}>
            <span>Inbox</span>
            <span className="dropdown-sub">failed vlogs, in-progress drafts, what needs your attention</span>
          </Link>
          <Link href="/studio" onClick={() => setOpen(false)}>
            <span>Studio (clusters)</span>
            <span className="dropdown-sub">the deeper cluster view — score, threads, refine</span>
          </Link>
          <a href="/podcast.xml" target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
            <span>Your podcast feed</span>
            <span className="dropdown-sub">RSS · paste into Apple/Overcast/Spotify</span>
          </a>
          <div className="sep"/>
          <Link href="/settings" onClick={() => setOpen(false)}>
            <span>Settings</span>
          </Link>
          <Link href="/about" onClick={() => setOpen(false)}>
            <span>About neolog</span>
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
