'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import {
  Home, PenSquare, Send, Settings, LogOut, User as UserIcon,
  PenLine, Command, Search, Upload, BarChart3, Layers, Tag,
  BookOpen, DollarSign, Globe, Share2, Sparkles
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { PublicationSwitcher } from '@/components/PublicationSwitcher'
import { onSelectedPublicationIdChange, readSelectedPublicationId, writeSelectedPublicationId } from '@/lib/publicationContext'
import { useUserMaturity } from '@/hooks/useUserMaturity'
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
  const [selectedPublicationId, setSelectedPublicationId] = useState<string | null>(null)
  const [selectedPublicationSlug, setSelectedPublicationSlug] = useState<string | null>(null)
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
    const loadPublicationSlug = async () => {
      if (!user) return

      let publicationId = selectedPublicationId

      if (!publicationId) {
        const { data: fallback } = await supabase
          .from('publications')
          .select('id, slug')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)

        if (fallback && fallback[0]) {
          publicationId = fallback[0].id
          setSelectedPublicationId(fallback[0].id)
          writeSelectedPublicationId(fallback[0].id)
          setSelectedPublicationSlug(fallback[0].slug)
          return
        }
      }

      if (!publicationId) {
        setSelectedPublicationSlug(null)
        return
      }

      const { data } = await supabase
        .from('publications')
        .select('slug')
        .eq('id', publicationId)
        .eq('owner_id', user.id)
        .maybeSingle()

      setSelectedPublicationSlug(data?.slug || null)
    }

    void loadPublicationSlug()
  }, [selectedPublicationId, user, supabase])

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

  // User maturity for progressive disclosure
  const { capabilities, loading: maturityLoading } = useUserMaturity(user?.id ?? null)

  // Enhanced Navigation with essential features
  const primaryNav = useMemo(() => {
    const items = [
      { href: '/dashboard', icon: Home, label: 'Dashboard' },
      { href: '/write', icon: PenLine, label: 'Write' },
      { href: '/import', icon: Upload, label: 'Import' },
    ]

    // Always show Analytics
    items.push({ href: '/analytics', icon: BarChart3, label: 'Analytics' })

    items.push({ href: '/dashboard/settings', icon: Settings, label: 'Settings' })

    return items
  }, [capabilities])

  // Secondary navigation for manage/organize features
  const secondaryNav = useMemo(() => {
    if (!capabilities.showPublishedTab) return [] // Only show after first publish

    return [
      { href: '/series', icon: Layers, label: 'Series' },
      { href: '/topics', icon: Tag, label: 'Topics' },
      { href: selectedPublicationSlug ? `/publications/${selectedPublicationSlug}/fediverse` : '/fediverse', icon: Globe, label: 'Fediverse' },
    ]
  }, [capabilities, selectedPublicationSlug])

  // Grow section for monetization features
  const growNav = useMemo(() => {
    return [
      { href: '/dashboard/agents', icon: Sparkles, label: 'Agents' },
      { href: '/dashboard/domain', icon: Globe, label: 'Custom Domain' },
      { href: '/dashboard/distribution', icon: Share2, label: 'Distribution' },
      { href: '/dashboard/api', icon: Command, label: 'API' },
      { href: '/dashboard/monetization', icon: DollarSign, label: 'Monetization' },
    ]
  }, [])

  const commandItems = useMemo(() => {
    const items = primaryNav.map((item) => ({
      label: item.label,
      href: item.href,
      description: 'Navigation',
    }))
    // Add common actions
    items.push(
      { label: 'New Post', href: '/write', description: 'Action' },
    )
    return items
  }, [primaryNav])

  if (loading) {
    return (
      <div className="flex h-screen bg-[var(--bg-secondary)] overflow-hidden">
        <div className="w-56 bg-[var(--bg-primary)] border-r border-[var(--border-light)] p-4 hidden md:flex flex-col">
          <div className="h-6 w-28 skeleton rounded mb-6" />
          <div className="space-y-1">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-10 skeleton rounded" />
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

  // Determine active label from new primary nav
  const activeLabel =
    primaryNav.find(
      (item) => pathname === item.href || pathname.startsWith(item.href + '/')
    )?.label ||
    (pathname === '/write' || pathname.startsWith('/write/') ? 'Write' : 'Dashboard')

  return (
    <div className="dashboard-shell flex min-h-screen bg-[var(--bg-secondary)]">
      {/* Sidebar - 5 Primary Destinations */}
      <aside className="w-[248px] bg-[var(--bg-primary)] border-r border-[var(--border-light)] hidden lg:flex flex-col">
        <div className="px-4 pt-5">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <Logo />
          </Link>
        </div>

        {/* Primary Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <div className="space-y-1">
            {primaryNav.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
              const Icon = link.icon

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-light)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                    }`}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  <span>{link.label}</span>
                </Link>
              )
            })}
          </div>

          {/* Manage Section */}
          {secondaryNav.length > 0 && (
            <div className="mt-6 pt-6 border-t border-[var(--border-light)]">
              <p className="px-3 text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-3">
                Manage
              </p>
              <div className="space-y-1">
                {secondaryNav.map((link) => {
                  const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                  const Icon = link.icon

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive
                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-light)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                        }`}
                    >
                      <Icon size={18} className="flex-shrink-0" />
                      <span>{link.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Grow Section */}
          {growNav.length > 0 && (
            <div className="mt-6 pt-6 border-t border-[var(--border-light)]">
              <p className="px-3 text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-3">
                Grow
              </p>
              <div className="space-y-1">
                {growNav.map((link) => {
                  const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                  const Icon = link.icon

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive
                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-light)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                        }`}
                    >
                      <Icon size={18} className="flex-shrink-0" />
                      <span>{link.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}


        </nav>

        {/* User Section */}
        <div className="border-t border-[var(--border-light)] px-3 py-4 space-y-1">
          {profile && (
            selectedPublicationSlug ? (
              <Link
                href={`/${selectedPublicationSlug}`}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
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
            ) : (
              <Link
                href="/dashboard/settings"
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
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
            )
          )}

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--error)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="dashboard-surface flex-1 flex flex-col">
        <header className="sticky top-0 z-[80] bg-[var(--bg-secondary)]/95 backdrop-blur border-b border-[var(--border-light)]">
          <div className="px-6 lg:px-8 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Mobile: Logo */}
              <Link href="/" className="lg:hidden flex items-center gap-2 hover:opacity-80 transition-opacity">
                <Logo />
              </Link>

              {/* Page Title */}
              <h1 className="text-lg font-display text-[var(--text-primary)]">{activeLabel}</h1>

              {/* Publication Switcher (if applicable) */}
              {capabilities.showPublicationsManagement && (
                <div className="hidden sm:block">
                  <PublicationSwitcher
                    currentPublicationId={selectedPublicationId}
                    onPublicationChange={(publicationId) => setSelectedPublicationId(publicationId)}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Search */}
              <button
                onClick={() => setCommandOpen(true)}
                className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-primary)] text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--border-medium)] transition-colors"
              >
                <Search size={14} />
                <span>Search...</span>
                <span className="text-[10px] ml-4 opacity-60">Cmd+/</span>
              </button>

              {/* Mobile buttons */}
              <button
                onClick={() => setCommandOpen(true)}
                className="inline-flex lg:hidden items-center justify-center w-9 h-9 rounded-lg border border-[var(--border-light)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Search"
              >
                <Search size={16} />
              </button>

              {/* New Post button */}
              <Link
                href="/write"
                className="hidden sm:inline-flex btn btn-primary btn-sm"
              >
                New Post
              </Link>

              {/* User avatar */}
              {profile && (
                selectedPublicationSlug ? (
                  <Link
                    href={`/${selectedPublicationSlug}`}
                    className="w-8 h-8 rounded-full bg-[var(--bg-primary)] border border-[var(--border-light)] overflow-hidden flex items-center justify-center"
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
                ) : (
                  <Link
                    href="/dashboard/settings"
                    className="w-8 h-8 rounded-full bg-[var(--bg-primary)] border border-[var(--border-light)] overflow-hidden flex items-center justify-center"
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
                )
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
