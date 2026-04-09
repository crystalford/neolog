'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import {
  Home, Settings, LogOut, User as UserIcon,
  PenLine, Command, Search, Upload, BarChart3,
  DollarSign, Share2, Sparkles, Video, Boxes,
  Clock, List, CalendarDays, Inbox, BookUser,
  Film, Briefcase, ArrowUpRight, Trophy, Zap,
  Brain, Cpu, Network, Radio, FolderOpen, Mic
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { Logo } from '@/components/Logo'

const DashboardCommandPalette = dynamic(
  () => import('@/components/DashboardCommandPalette').then((mod) => mod.DashboardCommandPalette),
  { ssr: false }
)

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [commandOpen, setCommandOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()


  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hostname.startsWith('www.')) {
      const nextHost = window.location.hostname.replace(/^www\./, '')
      const nextUrl = `${window.location.protocol}//${nextHost}${window.location.pathname}${window.location.search}${window.location.hash}`
      window.location.replace(nextUrl)
      return
    }

    loadUserAndProfile()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          loadProfile(session.user.id)
        } else {
          setProfile(null)
          router.push('/login')
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isModifier = event.metaKey || event.ctrlKey

      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const isEditable =
        tag === 'input' ||
        tag === 'textarea' ||
        (target?.getAttribute('contenteditable') ?? '') === 'true'

      // Quick switch (command palette)
      if (isModifier && event.key === '/') {
        if (isEditable) return
        event.preventDefault()
        setCommandOpen(true)
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [router])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target as HTMLElement | null
      const anchor = target?.closest('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return
      if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      const targetAttr = anchor.getAttribute('target')
      if (targetAttr && targetAttr !== '_self') return

      event.preventDefault()
      if (typeof window !== 'undefined') {
        window.location.assign(href)
      } else {
        router.push(href)
      }
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [router])

  const loadUserAndProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user ?? null)

    if (session?.user) {
      await loadProfile(session.user.id)
    } else {
      router.push('/login')
    }

    setLoading(false)
  }

  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url, onboarded_at')
      .eq('id', userId)
      .single()

    if (error) {
      // Backward-compatible: if the column doesn't exist yet, don't block access.
      if ((error as any).message?.includes('onboarded_at')) {
        const { data: fallback } = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url')
          .eq('id', userId)
          .single()

        if (fallback) {
          setProfile(fallback)
        }
        return
      }
      return
    }

    if (data) {
      if (!data.onboarded_at) {
        router.push('/onboarding')
        return
      }
      setProfile(data)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }


  // INGEST section — primary actions
  const primaryNav = useMemo(() => [
    { href: '/dashboard',         icon: Command,   label: 'Control Room',  section: 'INGEST' },
    { href: '/dashboard/studio',  icon: Film,      label: 'Studio',        section: 'INGEST' },
    { href: '/dashboard/uploads', icon: Film,      label: 'Uploads',       section: 'INGEST' },
], [])

  // INTELLIGENCE section — what the system extracted
  const secondaryNav = useMemo(() => [
    { href: '/dashboard/timeline',   icon: CalendarDays, label: 'Timeline',         section: 'INTELLIGENCE' },
    { href: '/dashboard/entities',   icon: Network,      label: 'Knowledge Graph',  section: 'INTELLIGENCE' },
    { href: '/dashboard/queue',      icon: Radio,        label: 'Post Queue',       section: 'INTELLIGENCE' },
  ], [])

  // MANIFEST section — the character being built
  const characterNav = useMemo(() => [
    { href: '/dashboard/character',  icon: UserIcon,  label: 'Identity',         section: 'MANIFEST' },
  ], [])

  const commandItems = useMemo(() => {
    const allNav = [...primaryNav, ...secondaryNav, ...characterNav]
    const items = allNav.map((item) => ({
      label: item.label,
      href: item.href,
      description: item.section,
    }))
    items.push(
      { label: 'New Log Entry', href: '/dashboard/log', description: 'Action' },
      { label: 'Upload Video', href: '/dashboard/uploads', description: 'Uploads' },
    )
    return items
  }, [primaryNav, secondaryNav, characterNav])

  if (loading) {
    return (
      <div className="flex h-screen bg-[var(--bg-primary)] overflow-hidden">
        <div className="w-64 bg-[var(--bg-secondary)] border-r border-[var(--border-medium)] p-4 hidden md:flex flex-col">
          <div className="h-6 w-28 skeleton rounded mb-6" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-10 skeleton rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex-1 flex flex-col overflow-y-auto">
          <div className="p-8">
            <div className="h-8 w-48 skeleton rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  // Determine active label across all nav sections
  const allNavItems = [...primaryNav, ...secondaryNav, ...characterNav]
  const activeLabel =
    allNavItems.find(
      (item) => pathname === item.href || pathname.startsWith(item.href + '/')
    )?.label ||
    (pathname === '/dashboard/settings' ? 'Settings' : 'Control Room')

  return (
    <div className="dashboard-shell flex h-screen bg-[var(--bg-primary)]">
      {/* Sidebar - 2.0 Control Room Nav */}
      <aside className="w-[220px] bg-[var(--bg-secondary)] border-r border-[var(--border-light)] hidden lg:flex flex-col">
        <div className="px-4 pt-4 pb-3">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo size="default" />
          </Link>
        </div>

        {/* Navigation — 3 sections */}
        <nav className="flex-1 overflow-y-auto px-3 py-1">
          {/* INGEST */}
          <div className="mb-1">
            <p className="px-2.5 text-[9px] uppercase tracking-widest text-[var(--text-tertiary)] mb-1 mt-3 font-semibold opacity-60">Ingest</p>
            <div className="space-y-0.5">
              {primaryNav.map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                const Icon = link.icon
                return (
                  <Link key={link.href} href={link.href}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-light)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]/60'
                    }`}
                  >
                    <Icon size={14} className="flex-shrink-0" />
                    <span>{link.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* INTELLIGENCE */}
          <div className="mt-4">
            <p className="px-2.5 text-[9px] uppercase tracking-widest text-[var(--text-tertiary)] mb-1 font-semibold opacity-60">Intelligence</p>
            <div className="space-y-0.5">
              {secondaryNav.map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                const Icon = link.icon
                return (
                  <Link key={link.href} href={link.href}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-light)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]/60'
                    }`}
                  >
                    <Icon size={14} className="flex-shrink-0" />
                    <span>{link.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* MANIFEST */}
          <div className="mt-4">
            <p className="px-2.5 text-[9px] uppercase tracking-widest text-[var(--accent)] mb-1 font-semibold opacity-60">Manifest</p>
            <div className="space-y-0.5">
              {characterNav.map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                const Icon = link.icon
                return (
                  <Link key={link.href} href={link.href}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/20 shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]/60'
                    }`}
                  >
                    <Icon size={14} className="flex-shrink-0" />
                    <span>{link.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Settings — bottom of nav */}
          <div className="mt-4">
            <div className="space-y-0.5">
              <Link href="/dashboard/settings"
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  pathname === '/dashboard/settings'
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-light)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]/60'
                }`}
              >
                <Settings size={14} className="flex-shrink-0" />
                <span>Settings</span>
              </Link>
            </div>
          </div>
        </nav>

        {/* User Section */}
        <div className="border-t border-[var(--border-light)] px-3 py-3 space-y-0.5">
          {profile && (
            <div className="flex flex-col gap-0.5">
              <Link
                href="/dashboard"
                target="_blank"
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/60 transition-colors"
                title="View your public log"
              >
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.display_name || profile.username}
                    className="w-5 h-5 rounded-full object-cover flex-shrink-0 border border-[var(--border-light)]"
                  />
                ) : (
                  <UserIcon size={14} className="flex-shrink-0" />
                )}
                <span className="truncate flex-1">
                  {profile.display_name || profile.username}
                </span>
                <ArrowUpRight size={12} className="opacity-40" />
              </Link>
            </div>
          )}

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-[var(--text-tertiary)] hover:text-[var(--error)] hover:bg-[var(--bg-tertiary)]/60 transition-colors"
          >
            <LogOut size={13} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="dashboard-surface flex-1 flex flex-col">
        <header className="sticky top-0 z-[80] bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border-light)]">
          <div className="px-5 lg:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Mobile: Logo */}
              <Link href="/" className="lg:hidden flex items-center gap-2">
                <span className="logo-mark">N</span>
              </Link>

              {/* Page Title */}
              <h1 className="text-sm font-medium text-[var(--text-primary)] tracking-tight">{activeLabel}</h1>

            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <button
                onClick={() => setCommandOpen(true)}
                className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-card)] text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--border-heavy)] transition-colors"
              >
                <Search size={14} />
                <span>Search...</span>
                <kbd className="hidden lg:inline-block ml-4 px-1.5 py-0.5 text-[10px] bg-[var(--bg-tertiary)] rounded border border-[var(--border-light)]">⌘/</kbd>
              </button>

              {/* Mobile buttons */}
              <button
                onClick={() => setCommandOpen(true)}
                className="inline-flex lg:hidden items-center justify-center w-9 h-9 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Search"
              >
                <Search size={16} />
              </button>

              {/* New Log Entry button */}
              <Link
                href="/dashboard/log"
                className="hidden sm:inline-flex btn btn-primary btn-sm"
              >
                + New Log
              </Link>

              {/* User avatar */}
              {profile && (
                <Link
                  href="/dashboard"
                  target="_blank"
                  className="w-9 h-9 rounded-full bg-[var(--bg-card)] border border-[var(--border-medium)] overflow-hidden flex items-center justify-center hover:border-[var(--border-heavy)] transition-colors"
                  title="View your public log"
                >
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.display_name || profile.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserIcon size={16} />
                  )}
                </Link>
              )}
            </div>
          </div>

          {/* Mobile Navigation Tabs */}
          <div className="lg:hidden flex border-t border-[var(--border-light)] overflow-x-auto">
            {primaryNav.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
              const Icon = link.icon

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex-1 min-w-0 flex flex-col items-center gap-1 py-2 px-3 text-xs transition-colors ${isActive
                    ? 'text-[var(--text-primary)] border-b-2 border-[var(--accent)]'
                    : 'text-[var(--text-tertiary)]'
                    }`}
                >
                  <Icon size={18} />
                  <span className="truncate">{link.label}</span>
                </Link>
              )
            })}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>

      <DashboardCommandPalette
        items={commandItems}
        isOpen={commandOpen}
        onClose={() => setCommandOpen(false)}
        onOpen={() => setCommandOpen(true)}
      />
    </div>
  )
}
