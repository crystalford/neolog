'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    // Check for saved preference or system preference
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || saved === 'light') {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved)
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark')
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('theme', newTheme)
  }

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <button className={`w-9 h-9 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center justify-center ${className}`}>
        <Sun size={16} className="text-[var(--text-tertiary)]" />
      </button>
    )
  }

  return (
    <button
      onClick={toggleTheme}
      className={`w-9 h-9 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center justify-center hover:border-[var(--border-medium)] transition-colors ${className}`}
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      {theme === 'light' ? (
        <Moon size={16} className="text-[var(--text-secondary)]" />
      ) : (
        <Sun size={16} className="text-[var(--text-secondary)]" />
      )}
    </button>
  )
}
