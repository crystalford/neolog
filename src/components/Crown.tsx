/**
 * Crown — top-of-page wordmark + rotating logo + date/time meta.
 * Sits at the top of every authed surface.
 */
'use client'

import { Logo } from './Logo'
import { useEffect, useState } from 'react'

export function Crown() {
  const [meta, setMeta] = useState({ day: '', time: '' })
  useEffect(() => {
    const update = () => {
      const d = new Date()
      const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      setMeta({ day, time })
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [])
  return (
    <header className="crown">
      <a href="/timeline" className="logo reveal d1" style={{ textDecoration: 'none' }}>
        <Logo />
        <span className="wordmark">neolog</span>
      </a>
      <div className="meta reveal d2">
        <div className="day">{meta.day || ' '}</div>
        <div>{meta.time || ' '}</div>
      </div>
    </header>
  )
}
