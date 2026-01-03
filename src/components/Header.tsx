'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { PenLine, LogOut, User as UserIcon, Settings, LayoutDashboard, BarChart3, Rocket, Rss, Users, Search, Bookmark, History, DollarSign, CreditCard, BookOpen, Layers, UserPlus } from 'lucide-react'
import { NotificationBell } from './NotificationBell'
import { ThemeToggle } from './ThemeToggle'
import { MobileNav } from './MobileNav'

export function Header() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setMenuOpen(false)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {/* Blur backdrop */}
      <div className="absolute inset-0 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-b border-[var(--border-light)]" />
      
      <div className="relative max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Mobile nav + Logo */}
        <div className="flex items-center gap-2">
          <MobileNav />
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="w-8 h-8 bg-[var(--accent)] rounded-lg flex items-center justify-center font-mono text-sm font-semibold text-white shadow-sm">
              N
            </span>
            <span className="font-display text-xl tracking-tight group-hover:text-[var(--accent)] transition-colors hidden sm:inline">
              Neolog
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          <Link 
            href="/explore" 
            className="px-4 py-2 text-[0.9375rem] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Explore
          </Link>
          <Link 
            href="/tags" 
            className="px-4 py-2 text-[0.9375rem] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Topics
          </Link>
        </nav>

        {/* Auth section */}
        <div className="flex items-center gap-3">
          {/* Search button */}
          <Link
            href="/search"
            className="w-9 h-9 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center justify-center hover:border-[var(--border-medium)] transition-colors"
          >
            <Search size={16} className="text-[var(--text-secondary)]" />
          </Link>

          <ThemeToggle />

          {loading ? (
            <div className="w-20 h-9 skeleton rounded-lg" />
          ) : user ? (
            <>
              <Link 
                href="/write" 
                className="btn btn-primary"
              >
                <PenLine size={16} />
                Write
              </Link>
              
              <NotificationBell />
              
              <div className="relative">
                <button 
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="w-9 h-9 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center justify-center hover:border-[var(--border-medium)] transition-colors"
                >
                  <UserIcon size={16} className="text-[var(--text-secondary)]" />
                </button>
                
                {menuOpen && (
                  <>
                    {/* Backdrop to close menu */}
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setMenuOpen(false)} 
                    />
                    
                    <div className="absolute right-0 top-full mt-2 w-52 bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-xl shadow-xl z-20 py-2 animate-scale-in origin-top-right">
                      <div className="px-4 py-2 border-b border-[var(--border-light)] mb-1">
                        <p className="text-sm font-medium truncate">{user.email}</p>
                      </div>
                      
                      <Link 
                        href="/dashboard" 
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <LayoutDashboard size={16} />
                        Dashboard
                      </Link>
                      <Link 
                        href="/feed" 
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <Rss size={16} />
                        Your Feed
                      </Link>
                      <Link 
                        href="/saved" 
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <Bookmark size={16} />
                        Saved
                      </Link>
                      <Link 
                        href="/history" 
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <History size={16} />
                        History
                      </Link>
                      <Link 
                        href="/lists" 
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <BookOpen size={16} />
                        Lists
                      </Link>
                      <Link 
                        href="/invitations" 
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <UserPlus size={16} />
                        Invitations
                      </Link>
                      <Link 
                        href="/analytics" 
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <BarChart3 size={16} />
                        Analytics
                      </Link>
                      <Link 
                        href="/subscribers" 
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <Users size={16} />
                        Subscribers
                      </Link>
                      <Link 
                        href="/boost" 
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <Rocket size={16} />
                        Boost
                      </Link>
                      <Link 
                        href="/series" 
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <Layers size={16} />
                        Series
                      </Link>
                      <Link 
                        href="/earnings" 
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <DollarSign size={16} />
                        Earnings
                      </Link>
                      <Link 
                        href="/tiers" 
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <CreditCard size={16} />
                        Tiers
                      </Link>
                      <Link 
                        href="/settings" 
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <Settings size={16} />
                        Settings
                      </Link>
                      
                      <div className="border-t border-[var(--border-light)] mt-1 pt-1">
                        <button 
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--error)] hover:bg-[var(--bg-secondary)] transition-colors"
                        >
                          <LogOut size={16} />
                          Sign out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <Link 
                href="/login" 
                className="btn btn-ghost hidden sm:inline-flex"
              >
                Sign in
              </Link>
              <Link 
                href="/signup" 
                className="btn btn-primary"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
