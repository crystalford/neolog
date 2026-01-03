'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Command, X } from 'lucide-react'

const SHORTCUTS = [
  { keys: ['⌘', 'K'], action: 'Search', path: '/search' },
  { keys: ['⌘', 'N'], action: 'New post', path: '/write' },
  { keys: ['⌘', 'D'], action: 'Dashboard', path: '/dashboard' },
  { keys: ['⌘', 'E'], action: 'Explore', path: '/explore' },
  { keys: ['⌘', '/'], action: 'Show shortcuts', path: null },
  { keys: ['Esc'], action: 'Close dialogs', path: null },
]

export function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false)
  const router = useRouter()

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in input/textarea
    if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return

    const isMod = e.metaKey || e.ctrlKey

    if (isMod && e.key === 'k') { e.preventDefault(); router.push('/search') }
    else if (isMod && e.key === 'n') { e.preventDefault(); router.push('/write') }
    else if (isMod && e.key === 'd') { e.preventDefault(); router.push('/dashboard') }
    else if (isMod && e.key === 'e') { e.preventDefault(); router.push('/explore') }
    else if (isMod && e.key === '/') { e.preventDefault(); setShowHelp(true) }
    else if (e.key === 'Escape') { setShowHelp(false) }
  }, [router])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!showHelp) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowHelp(false)} />
      <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-2xl w-full max-w-md p-6 animate-scale-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl flex items-center gap-2">
            <Command size={20} className="text-[var(--accent)]" />
            Keyboard Shortcuts
          </h2>
          <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-[var(--bg-secondary)] rounded-lg">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          {SHORTCUTS.map(({ keys, action }) => (
            <div key={action} className="flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">{action}</span>
              <div className="flex items-center gap-1">
                {keys.map((key, i) => (
                  <kbd key={i} className="px-2 py-1 text-xs bg-[var(--bg-secondary)] rounded border border-[var(--border-light)]">
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}