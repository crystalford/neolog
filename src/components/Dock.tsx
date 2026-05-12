/**
 * Dock — five-entry bottom navigation: Timeline · Studio · Graph · Projects · Settings.
 * Capture is a separate floating FAB, not in the dock.
 */
'use client'

import { usePathname } from 'next/navigation'

const ENTRIES = [
  {
    href: '/timeline',
    label: 'Timeline',
    svg: (
      <svg width="20" height="20" viewBox="0 0 20 20">
        <line x1="3" y1="6" x2="17" y2="6" />
        <line x1="3" y1="10" x2="17" y2="10" />
        <line x1="3" y1="14" x2="17" y2="14" />
        <circle cx="6" cy="6" r="1.2" fill="currentColor" />
        <circle cx="9" cy="10" r="1.2" fill="currentColor" />
        <circle cx="13" cy="14" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/studio',
    label: 'Studio',
    svg: (
      <svg width="20" height="20" viewBox="0 0 20 20">
        <path d="M10 3 L17 10 L10 17 L3 10 Z" />
      </svg>
    ),
  },
  {
    href: '/graph',
    label: 'Graph',
    svg: (
      <svg width="20" height="20" viewBox="0 0 20 20">
        <circle cx="5" cy="6" r="1.8" />
        <circle cx="15" cy="6" r="1.8" />
        <circle cx="5" cy="14" r="1.8" />
        <circle cx="15" cy="14" r="1.8" />
        <circle cx="10" cy="10" r="2.2" />
        <line x1="6.5" y1="7" x2="8.5" y2="9" />
        <line x1="13.5" y1="7" x2="11.5" y2="9" />
        <line x1="6.5" y1="13" x2="8.5" y2="11" />
        <line x1="13.5" y1="13" x2="11.5" y2="11" />
      </svg>
    ),
  },
  {
    href: '/projects',
    label: 'Projects',
    svg: (
      <svg width="20" height="20" viewBox="0 0 20 20">
        <rect x="3" y="4" width="14" height="3" rx="0.5" />
        <rect x="3" y="9" width="14" height="3" rx="0.5" />
        <rect x="3" y="14" width="14" height="3" rx="0.5" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    svg: (
      <svg width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="2.5" />
        <path d="M10 4 L10 6 M10 14 L10 16 M4 10 L6 10 M14 10 L16 10 M5.5 5.5 L7 7 M13 13 L14.5 14.5 M5.5 14.5 L7 13 M13 7 L14.5 5.5" />
      </svg>
    ),
  },
]

export function Dock() {
  const path = usePathname() || ''
  return (
    <nav className="dock">
      {ENTRIES.map(e => {
        const active = path === e.href || path.startsWith(e.href + '/')
        return (
          <a key={e.href} href={e.href} className={`dock-btn ${active ? 'active' : ''}`}>
            <span className="ico">{e.svg}</span>
            <span>{e.label}</span>
          </a>
        )
      })}
    </nav>
  )
}
