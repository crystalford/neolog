/**
 * CMD-K palette — global typeahead overlay.
 *
 * Triggered by Cmd/Ctrl+K from anywhere. Searches vlogs / threads /
 * clusters in real time via /api/v2/search. Arrow keys to navigate
 * results, Enter to open, Esc to close.
 *
 * Stays out of the way: renders nothing when closed. Mounted once at
 * Shell level so every page gets the shortcut without per-page wiring.
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface SearchResults {
  vlogs: { id: string; title: string; date: string | null }[]
  threads: { id: string; topic: string; take: string; abstracted_topic: string | null }[]
  clusters: { id: string; label: string; ripeness: number }[]
}

interface Item {
  kind: 'vlog' | 'thread' | 'cluster' | 'action'
  href: string
  title: string
  sub: string
}

const STATIC_ACTIONS: Item[] = [
  { kind: 'action', href: '/', title: 'Go to Timeline', sub: 'jump to feed' },
  { kind: 'action', href: '/threads', title: 'Go to Threads', sub: 'atomic takes list' },
  { kind: 'action', href: '/clusters', title: 'Go to Clusters', sub: 'riffs that formed' },
  { kind: 'action', href: '/vlogs', title: 'Go to Vlogs', sub: 'source recordings' },
  { kind: 'action', href: '/graph', title: 'Go to Graph', sub: 'visual substrate' },
  { kind: 'action', href: '/console', title: 'Go to Chat', sub: 'in-app assistant' },
  { kind: 'action', href: '/capture', title: 'Capture · new vlog', sub: 'upload or record' },
  { kind: 'action', href: '/system', title: 'System health', sub: 'pipeline status' },
  { kind: 'action', href: '/settings', title: 'Settings', sub: 'operator preferences' },
]

export function CmdK() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResults>({ vlogs: [], threads: [], clusters: [] })
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Global hotkey
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  useEffect(() => {
    if (open) {
      setQ('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // Search as the operator types
  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setResults({ vlogs: [], threads: [], clusters: [] })
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      fetch(`/api/v2/search?q=${encodeURIComponent(q)}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then((d: any) => { if (!cancelled) setResults(d as SearchResults) })
        .catch(() => { if (!cancelled) setResults({ vlogs: [], threads: [], clusters: [] }) })
    }, 120)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, open])

  if (!open) return null

  const items: Item[] = q.trim().length < 2
    ? STATIC_ACTIONS
    : [
        ...results.threads.map(t => ({
          kind: 'thread' as const,
          href: `/thread/${t.id}`,
          title: t.topic || 'Thread',
          sub: t.take ? trunc(t.take, 70) : (t.abstracted_topic ?? 'thread'),
        })),
        ...results.clusters.map(c => ({
          kind: 'cluster' as const,
          href: `/cluster/${c.id}`,
          title: c.label,
          sub: `cluster · ripe ${Math.round(c.ripeness)}`,
        })),
        ...results.vlogs.map(v => ({
          kind: 'vlog' as const,
          href: `/timeline/${v.id}`,
          title: v.title,
          sub: v.date ? `vlog · ${new Date(v.date).toLocaleDateString()}` : 'vlog',
        })),
      ]

  const open_idx = Math.max(0, Math.min(items.length - 1, activeIdx))

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(items.length - 1, i + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)) }
          else if (e.key === 'Enter') {
            e.preventDefault()
            const it = items[open_idx]
            if (it) { setOpen(false); router.push(it.href) }
          }
        }}
        style={{
          width: 560, maxWidth: '92vw',
          background: 'var(--bg-1)', border: '1px solid var(--line-1)',
          borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px', borderBottom: '1px solid var(--line)',
        }}>
          <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="var(--fg-3)" strokeWidth={1.4}>
            <circle cx="6" cy="6" r="4.5"/><path d="M9.5 9.5 L13 13"/>
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setActiveIdx(0) }}
            placeholder="Search vlogs · threads · clusters · jump anywhere"
            style={{
              flex: 1, fontSize: 14, color: 'var(--fg-1)',
              background: 'transparent', border: 'none', outline: 'none',
              fontFamily: 'Geist, system-ui, sans-serif',
            }}
          />
          <span style={{
            fontSize: 10, padding: '2px 6px', borderRadius: 3,
            background: 'var(--bg-3)', color: 'var(--fg-3)',
            fontFamily: 'Geist Mono, ui-monospace, monospace',
          }}>ESC</span>
        </div>
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {items.length === 0 ? (
            <div style={{ padding: 18, color: 'var(--fg-4)', fontSize: 12, textAlign: 'center' }}>
              No matches.
            </div>
          ) : items.map((it, i) => (
            <div
              key={it.kind + '-' + it.href + '-' + i}
              onClick={() => { setOpen(false); router.push(it.href) }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 18px', cursor: 'pointer',
                background: open_idx === i ? 'var(--bg-2)' : 'transparent',
                borderLeft: open_idx === i ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              <span style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 3,
                background: 'var(--bg-3)', color: kindColor(it.kind),
                fontFamily: 'Geist Mono, ui-monospace, monospace',
                textTransform: 'uppercase', letterSpacing: 0.5,
                minWidth: 56, textAlign: 'center',
              }}>{it.kind}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {it.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {it.sub}
                </div>
              </div>
              {open_idx === i && (
                <span style={{
                  fontSize: 9, padding: '2px 5px', borderRadius: 3,
                  background: 'var(--bg-3)', color: 'var(--fg-3)',
                  fontFamily: 'Geist Mono, ui-monospace, monospace',
                }}>↵</span>
              )}
            </div>
          ))}
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '8px 18px', borderTop: '1px solid var(--line)',
          fontSize: 10, color: 'var(--fg-4)',
          fontFamily: 'Geist Mono, ui-monospace, monospace', letterSpacing: 0.4,
        }}>
          <span>↑ ↓ navigate · ↵ open · esc close</span>
          <span>⌘K toggle</span>
        </div>
      </div>
    </div>
  )
}

function kindColor(k: Item['kind']): string {
  return ({
    vlog:    'var(--t-1)',
    thread:  'var(--t-5)',
    cluster: 'var(--t-3)',
    action:  'var(--fg-3)',
  } as Record<string, string>)[k]
}
function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '…' : s }
