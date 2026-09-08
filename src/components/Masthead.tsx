'use client'

/**
 * The masthead.
 *
 * `log.html`, verbatim: the mark, the wordmark, the private badge, and
 * **three** entries — home · search · index. That is the whole nav in the
 * design package, on every page of it, and it is the nav here.
 *
 * ── What used to be here, and why it is gone ─────────────────────────────
 *
 * This carried Log · Archive · Drafts · Published, a health pill, and a
 * dropdown with Chat, Inbox, Studio and a podcast feed. All of that was the
 * video-essay studio — a different product that happened to share a
 * database. The operator, 8 Sep: *"i'm seeing a sort of hybrid of the old
 * site and the new site... i don't want to see evidence of the old site."*
 *
 * So the rule for this file from here on: **an entry goes in the nav only
 * if a page in the design package puts it there.** The package puts three.
 * Everything else in the product is reached from the page it belongs to —
 * the footer, the rail, a row — which is what `everything.html` means by "a
 * stranger chooses between two things" and what keeps the log from
 * accumulating a dashboard again.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV: { label: string; href: string; matchPaths: RegExp[] }[] = [
  { label: 'home',   href: '/',       matchPaths: [/^\/$/, /^\/now/, /^\/entry\//, /^\/walk\//] },
  { label: 'search', href: '/search', matchPaths: [/^\/search/] },
  { label: 'index',  href: '/pages',  matchPaths: [/^\/pages/, /^\/page\//] },
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

      <span className="pv">private · only you see this</span>

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
        <AvatarMenu/>
      </div>
    </header>
  )
}

/**
 * The way out, and the two things that are neither the log nor a page of it.
 *
 * Deliberately short. Everything that is a real surface of the log has a
 * door on the log; a dropdown of destinations is how the old nav grew.
 */
function AvatarMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
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
          <Link href="/vlogs" onClick={() => setOpen(false)}>
            <span>Recordings</span>
            <span className="dropdown-sub">the files themselves, and what has been read out of them</span>
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
