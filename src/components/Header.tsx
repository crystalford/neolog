'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { PenLine, LogOut, User as UserIcon, Settings, LayoutDashboard } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { MobileNav } from './MobileNav'

export function Header() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadUserAndProfile()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          loadProfile(session.user.id)
        } else {
          setProfile(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const loadUserAndProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user ?? null)

    if (session?.user) {
      await loadProfile(session.user.id)
    }

    setLoading(false)
  }

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .eq('id', userId)
      .single()

    if (data) {
      setProfile(data)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setMenuOpen(false)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[var(--bg-primary)]/95 backdrop-blur-md border-b border-[var(--border-light)]">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 h-16 flex items-center justify-between">
        {/* Mobile nav + Logo */}
        <div className="flex items-center gap-4">
          <MobileNav />
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="logo-mark">
              N
            </span>
            <span className="font-display text-xl tracking-tight group-hover:text-[var(--accent)] transition-colors hidden sm:inline">
              neolog
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          <Link href="/explore" className="nav-link px-4 py-2">
            Explore
          </Link>
          <Link href="/tags" className="nav-link px-4 py-2">
            Topics
          </Link>
          {user && (
            <Link href="/feed" className="nav-link px-4 py-2">
              Feed
            </Link>
          )}
        </nav>

        {/* Auth section */}
        <div className="flex items-center gap-3">
          <ThemeToggle />

          {loading ? (
            <div className="w-24 h-10 skeleton rounded-xl" />
          ) : user ? (
            <>
              <Link href="/write" className="btn btn-primary">
                <PenLine size={18} />
                <span className="hidden sm:inline">Write</span>
              </Link>

              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] hover:bg-[var(--bg-tertiary)] transition-all"
                >
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.display_name || profile.username}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <UserIcon size={18} className="text-[var(--text-secondary)]" />
                  )}
                  <span className="text-sm font-medium hidden md:inline">
                    {profile?.display_name || profile?.username || 'Menu'}
                  </span>
                </button>

                {menuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setMenuOpen(false)}
                    />

                    <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-xl shadow-2xl z-20 py-2 animate-scale-in origin-top-right">
                      {profile?.username && (
                        <>
                          <Link
                            href={`/${profile.username}`}
                            onClick={() => setMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                          >
                            <UserIcon size={16} />
                            Profile
                          </Link>
                          <div className="h-px bg-[var(--border-light)] my-1" />
                        </>
                      )}

                      <Link
                        href="/dashboard"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <LayoutDashboard size={16} />
                        Dashboard
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <Settings size={16} />
                        Settings
                      </Link>

                      <div className="h-px bg-[var(--border-light)] my-1" />

                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--error)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <LogOut size={16} />
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost hidden sm:inline-flex">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
