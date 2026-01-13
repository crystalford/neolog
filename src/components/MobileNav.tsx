'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  Menu, X, Home, Compass, PenLine, Bell, User,
  Settings, BarChart3, Rocket, DollarSign, LogOut,
  Bookmark, History, Search, CreditCard
} from 'lucide-react'

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
    })
  }, [])

  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  // Prevent scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const NavLink = ({ href, icon: Icon, children }: { href: string; icon: any; children: React.ReactNode }) => (
    <Link
      href={href}
      className={`nav-link nav-link-block ${
        pathname === href 
          ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-transparent' 
          : 'hover:bg-[var(--bg-secondary)]'
      }`}
    >
      <Icon size={20} />
      <span className="font-medium">{children}</span>
    </Link>
  )

  return (
    <>
      {/* Toggle button - only show on mobile */}
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden p-2 -ml-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
        aria-label="Open menu"
      >
        <Menu size={24} />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide-out menu */}
      <div
        className={`fixed top-0 left-0 bottom-0 w-[280px] bg-[var(--bg-primary)] z-50 transform transition-transform duration-200 ease-out md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-light)]">
          <Link href="/" className="font-display text-xl">neolog</Link>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto h-[calc(100%-64px)]">
          {/* Main nav */}
          <nav className="space-y-1 mb-6">
            <NavLink href="/" icon={Home}>Home</NavLink>
            <NavLink href="/explore" icon={Compass}>Explore</NavLink>
            <NavLink href="/search" icon={Search}>Search</NavLink>
          </nav>

          {user ? (
            <>
              {/* Authenticated nav */}
              <div className="border-t border-[var(--border-light)] pt-4 mb-6">
                <p className="px-4 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-2">
                  Your Stuff
                </p>
                <nav className="space-y-1">
                  <NavLink href="/write" icon={PenLine}>Write</NavLink>
                  <NavLink href="/feed" icon={Home}>Feed</NavLink>
                  <NavLink href="/notifications" icon={Bell}>Notifications</NavLink>
                  <NavLink href="/saved" icon={Bookmark}>Saved</NavLink>
                  <NavLink href="/history" icon={History}>History</NavLink>
                </nav>
              </div>

              <div className="border-t border-[var(--border-light)] pt-4 mb-6">
                <p className="px-4 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-2">
                  Creator Tools
                </p>
                <nav className="space-y-1">
                  <NavLink href="/dashboard" icon={BarChart3}>Dashboard</NavLink>
                  <NavLink href="/dashboard/tiers" icon={CreditCard}>Tiers</NavLink>
                  <NavLink href="/dashboard/earnings" icon={DollarSign}>Earnings</NavLink>
                  <NavLink href="/dashboard/boost" icon={Rocket}>Boost</NavLink>
                  <NavLink href="/dashboard/settings" icon={Settings}>Settings</NavLink>
                </nav>
              </div>

              <div className="border-t border-[var(--border-light)] pt-4">
                <nav className="space-y-1">
                  <NavLink href="/settings" icon={Settings}>Settings</NavLink>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--error)] transition-colors"
                  >
                    <LogOut size={20} />
                    <span className="font-medium">Sign Out</span>
                  </button>
                </nav>
              </div>
            </>
          ) : (
            <div className="border-t border-[var(--border-light)] pt-4">
              <Link href="/login" className="btn btn-primary w-full mb-2">
                Sign In
              </Link>
              <Link href="/signup" className="btn btn-secondary w-full">
                Create Account
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
