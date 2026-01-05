'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

type CommandItem = {
  label: string
  href: string
  description?: string
}

type DashboardCommandPaletteProps = {
  items: CommandItem[]
  isOpen: boolean
  onClose: () => void
  onOpen: () => void
}

export function DashboardCommandPalette({
  items,
  isOpen,
  onClose,
  onOpen,
}: DashboardCommandPaletteProps) {
  const [query, setQuery] = useState('')
  const router = useRouter()

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isModifier = event.metaKey || event.ctrlKey
      if (isModifier && event.key === '/') {
        event.preventDefault()
        onOpen()
      }
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, onOpen])

  useEffect(() => {
    if (!isOpen) setQuery('')
  }, [isOpen])

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return items
    return items.filter((item) =>
      item.label.toLowerCase().includes(value) ||
      (item.description || '').toLowerCase().includes(value)
    )
  }, [items, query])

  const handleSelect = (href: string) => {
    onClose()
    router.push(href)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 backdrop-blur-sm px-4 py-16">
      <div className="w-full max-w-2xl rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-light)]">
          <Search size={18} className="text-[var(--text-tertiary)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search actions, pages, posts..."
            className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
            autoFocus
          />
          <span className="text-xs text-[var(--text-tertiary)] border border-[var(--border-light)] rounded px-2 py-1">
            ESC
          </span>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-sm text-[var(--text-tertiary)]">
              No matching results.
            </div>
          ) : (
            <ul className="py-2">
              {filtered.map((item) => (
                <li key={item.href}>
                  <button
                    onClick={() => handleSelect(item.href)}
                    className="w-full text-left px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <p className="text-sm font-medium text-[var(--text-primary)]">{item.label}</p>
                    {item.description && (
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">
                        {item.description}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-4 py-3 border-t border-[var(--border-light)] text-xs text-[var(--text-tertiary)] flex flex-wrap items-center gap-4">
          <span>Shortcuts</span>
          <span>Ctrl+/ · Open switcher</span>
          <span>Ctrl+N · New post</span>
          <span>Esc · Close</span>
        </div>
      </div>
    </div>
  )
}
