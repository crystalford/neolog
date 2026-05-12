/**
 * Logo — three rotating marks per session (Aperture, Stratum, Filament).
 * Choice is sticky in sessionStorage to stay consistent across navigation.
 */
'use client'

import { useEffect, useState } from 'react'

type Mark = 'aperture' | 'stratum' | 'filament'
const ALL: Mark[] = ['aperture', 'stratum', 'filament']

function pickMark(): Mark {
  if (typeof window === 'undefined') return 'aperture'
  const stored = sessionStorage.getItem('neolog-logo') as Mark | null
  if (stored && ALL.includes(stored)) return stored
  const choice = ALL[Math.floor(Math.random() * ALL.length)]
  sessionStorage.setItem('neolog-logo', choice)
  return choice
}

export function Logo({ size = 22 }: { size?: number }) {
  const [mark, setMark] = useState<Mark>('aperture')
  useEffect(() => { setMark(pickMark()) }, [])
  return (
    <span className="mark" style={{ width: size, height: size }} aria-label="Neolog">
      {mark === 'aperture' && (
        <svg viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <circle cx="11" cy="11" r="5" fill="currentColor" />
          <path d="M 11 6 L 11 11 L 16 11 A 5 5 0 0 0 11 6 Z" fill="#1a1611" />
        </svg>
      )}
      {mark === 'stratum' && (
        <svg viewBox="0 0 22 22" fill="none">
          <line x1="3" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="3" y1="10" x2="19" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
          <line x1="3" y1="14" x2="19" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
          <line x1="3" y1="18" x2="19" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
        </svg>
      )}
      {mark === 'filament' && (
        <svg viewBox="0 0 22 22" fill="none">
          <path d="M 3 11 Q 7 4, 11 11 T 19 11" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <circle cx="3" cy="11" r="1.8" fill="currentColor" />
          <circle cx="19" cy="11" r="1.8" fill="currentColor" />
        </svg>
      )}
    </span>
  )
}
