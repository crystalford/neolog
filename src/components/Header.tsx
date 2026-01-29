'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export function Header() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const loadUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user ?? null)
    setLoading(false)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[var(--bg-primary)]/90 backdrop-blur-sm border-b border-[var(--border-light)]">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="logo-mark">N</span>
          <span className="font-display text-lg tracking-tight text-[var(--text-primary)]">
            Neolog
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-4 text-sm text-[var(--text-secondary)]">
          <Link href="/explore" className="hover:text-[var(--text-primary)] transition-colors">
            Explore
          </Link>
        </nav>

        {/* Auth buttons */}
        <div className="flex items-center gap-3">
          {loading ? null : user ? (
            <Link
              href="/dashboard"
              className="btn btn-secondary btn-sm"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="btn btn-secondary btn-sm"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="btn btn-primary btn-sm"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
