'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import {
  LayoutDashboard, BookOpen, BarChart3, Mail, Layers, Gift,
  Zap, Settings, LogOut, User as UserIcon,
  PenLine, Bell, Radio, List, Bookmark, Clock, Command, Hash, Globe, Monitor, Inbox, FileUp
} from 'lucide-react'
import { DashboardCommandPalette } from '@/components/DashboardCommandPalette'
import { QuickCaptureModal } from '@/components/QuickCaptureModal'
import { PublicationSwitcher } from '@/components/PublicationSwitcher'
import { onSelectedPublicationIdChange, readSelectedPublicationId } from '@/lib/publicationContext'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [commandOpen, setCommandOpen] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [selectedPublicationId, setSelectedPublicationId] = useState<string | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    setSelectedPublicationId(readSelectedPublicationId())

    const unsubscribe = onSelectedPublicationIdChange((publicationId) => {
      if (publicationId) setSelectedPublicationId(publicationId)
    })

    return unsubscribe
  }, [])

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

      // Quick capture
      if (isModifier && event.key.toLowerCase() === 'k') {
        if (isEditable) return

        event.preventDefault()
        setCaptureOpen(true)
        return
      }

      // Quick switch (command palette)
      if (isModifier && event.key === '/') {
        if (isEditable) return
        event.preventDefault()
        setCommandOpen(true)
        return
      }

      if (isModifier && event.key.toLowerCase() === 'n') {
        if (isEditable) return
        event.preventDefault()
        router.push('/write')
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

  const navSections = [
    {
      title: 'Create',
      items: [
        { href: '/write', icon: PenLine, label: 'Write' },
        { href: '/vault', icon: Command, label: 'Vault' },
        { href: '/dashboard', icon: LayoutDashboard, label: 'Posts' },
        { href: '/import', icon: FileUp, label: 'Import' },
        { href: '/topics', icon: Hash, label: 'Topics' },
        { href: '/series', icon: Layers, label: 'Series' },
        { href: '/publications', icon: BookOpen, label: 'Publications' },
      ],
    },
    {
      title: 'Audience',
      items: [
        { href: '/subscribers', icon: Mail, label: 'Subscribers' },
        { href: '/lists', icon: List, label: 'Lists' },
        { href: '/notifications', icon: Bell, label: 'Notifications' },
        { href: '/saved', icon: Bookmark, label: 'Saved' },
      ],
    },
    {
      title: 'Distribution',
      items: [
        { href: '/monitors', icon: Monitor, label: 'Monitors' },
        { href: '/analytics', icon: BarChart3, label: 'Analytics' },
        { href: '/syndication', icon: Radio, label: 'Syndication' },
        { href: '/sources', icon: Globe, label: 'Sources' },
        { href: '/inbox', icon: Inbox, label: 'Inbox' },
        { href: '/referrals', icon: Gift, label: 'Referrals' },
        { href: '/boost', icon: Zap, label: 'Boost' },
      ],
    },
    {
      title: 'Workspace',
      items: [
        { href: '/feed', icon: Radio, label: 'Feed' },
        { href: '/history', icon: Clock, label: 'History' },
      ],
    },
  ]

  const commandItems = useMemo(() => {
    const items = navSections.flatMap((section) =>
      section.items.map((item) => ({
        label: item.label,
        href: item.href,
        description: section.title,
      }))
    )
    items.push({ label: 'Settings', href: '/settings', description: 'Workspace' })
    return items
  }, [navSections])

  if (loading) {
    return (
      <div className="flex h-screen bg-[var(--bg-secondary)] overflow-hidden">
        <div className="w-56 bg-[var(--bg-primary)] border-r border-[var(--border-light)] p-4 hidden md:flex flex-col">
          <div className="h-6 w-28 skeleton rounded mb-6" />
          <div className="space-y-1">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-7 skeleton rounded" />
            ))}
          </div>
        </div>
        <div className="flex-1 flex flex-col overflow-y-auto">
          <div className="p-8">
            <div className="h-8 w-48 skeleton rounded" />
          </div>
        </div>
      </div>
    )
  }

  const activeLabel =
    navSections
      .flatMap((section) => section.items)
      .find((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
      ?.label || (pathname.startsWith('/settings') ? 'Settings' : 'Dashboard')

  return (
    <div className="dashboard-shell flex min-h-screen bg-[var(--bg-secondary)]">
      {/* Sidebar */}
      <aside className="w-[248px] bg-[var(--bg-primary)] border-r border-[var(--border-light)] hidden lg:flex flex-col">
        <div className="px-4 pt-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="logo-mark logo-mark-lg">N</span>
            <span className="font-display text-xl">Neolog</span>
          </Link>

          <Link
            href="/write"
            className="mt-5 btn btn-primary btn-sm w-full justify-between"
          >
            <span className="flex items-center gap-2">
              <PenLine size={16} />
              New post
            </span>
            <span className="text-xs opacity-80">Ctrl+N</span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-4">
          {navSections.map((section) => (
            <div key={section.title}>
              <p className="px-2 text-[11px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((link) => {
                  const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                  const Icon = link.icon

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-light)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                      }`}
                    >
                      <Icon size={16} className="flex-shrink-0" />
                      <span>{link.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--border-light)] px-3 py-4 space-y-1">
          <Link
            href="/settings"
            className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/settings'
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-light)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
            }`}
          >
            <Settings size={16} />
            <span>Settings</span>
          </Link>

          {profile && (
            <Link
              href={`/${profile.username}`}
              className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name || profile.username}
                  className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <UserIcon size={16} className="flex-shrink-0" />
              )}
              <span className="truncate text-sm">
                {profile.display_name || profile.username}
              </span>
            </Link>
          )}

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--error)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="dashboard-surface flex-1 flex flex-col">
        <header className="sticky top-0 z-[80] bg-[var(--bg-secondary)]/95 backdrop-blur border-b border-[var(--border-light)]">
          <div className="px-6 lg:px-12 py-2 flex items-center justify-between">
            <div className="flex items-baseline gap-3">
              <span className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
                Workspace
              </span>
              <div className="hidden sm:block">
                <PublicationSwitcher
                  currentPublicationId={selectedPublicationId}
                  onPublicationChange={(publicationId) => setSelectedPublicationId(publicationId)}
                />
              </div>
              <span className="text-lg font-display text-[var(--text-primary)]">{activeLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCaptureOpen(true)}
                className="hidden md:inline-flex btn btn-secondary btn-sm"
              >
                <Zap size={14} />
                Quick capture
                <span className="text-[10px] text-[var(--text-tertiary)]">Ctrl+K</span>
              </button>
              <button
                onClick={() => setCommandOpen(true)}
                className="inline-flex md:hidden items-center justify-center w-8 h-8 rounded-lg border border-[var(--border-light)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-medium)] transition-colors"
                aria-label="Quick switch"
              >
                <Command size={16} />
              </button>
              <button
                onClick={() => setCaptureOpen(true)}
                className="inline-flex md:hidden items-center justify-center w-8 h-8 rounded-lg border border-[var(--border-light)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-medium)] transition-colors"
                aria-label="Quick capture"
              >
                <Zap size={16} />
              </button>
              <button
                onClick={() => setCommandOpen(true)}
                className="hidden md:inline-flex btn btn-secondary btn-sm"
              >
                <Command size={14} />
                Quick switch
                <span className="text-[10px] text-[var(--text-tertiary)]">Ctrl+/</span>
              </button>
              <Link
                href="/write"
                className="hidden sm:inline-flex btn btn-primary btn-sm"
              >
                <PenLine size={16} />
                New post
              </Link>
              {profile && (
                <Link
                  href={`/${profile.username}`}
                  className="hidden sm:inline-flex btn btn-secondary btn-sm"
                >
                  View site
                </Link>
              )}
              {profile && (
                <Link
                  href={`/${profile.username}`}
                  className="w-7 h-7 rounded-full bg-[var(--bg-primary)] border border-[var(--border-light)] overflow-hidden flex items-center justify-center"
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

      <QuickCaptureModal
        isOpen={captureOpen}
        onClose={() => setCaptureOpen(false)}
        initialPublicationId={selectedPublicationId}
      />
    </div>
  )
}
