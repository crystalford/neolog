'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import {
  LayoutDashboard, BookOpen, BarChart3, Mail, Layers, Gift,
  Zap, DollarSign, Users, Settings, LogOut, User as UserIcon,
  PenLine, Bell, Radio, List, Bookmark, Clock, Upload, UserPlus
} from 'lucide-react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()
  const router = useRouter()
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
          router.push('/login')
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
    } else {
      router.push('/login')
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
    router.push('/')
  }

  const navLinks = [
    { href: '/write', icon: PenLine, label: 'Write' },
    { href: '/dashboard', icon: LayoutDashboard, label: 'Posts' },
    { href: '/feed', icon: Radio, label: 'Feed' },
    { href: '/notifications', icon: Bell, label: 'Notifications' },
    { href: '/lists', icon: List, label: 'Lists' },
    { href: '/saved', icon: Bookmark, label: 'Saved' },
    { href: '/publications', icon: BookOpen, label: 'Publications' },
    { href: '/analytics', icon: BarChart3, label: 'Analytics' },
    { href: '/subscribers', icon: Mail, label: 'Subscribers' },
    { href: '/series', icon: Layers, label: 'Series' },
    { href: '/referrals', icon: Gift, label: 'Referrals' },
    { href: '/boost', icon: Zap, label: 'Boost' },
    { href: '/history', icon: Clock, label: 'History' },
  ]

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <div className="w-56 bg-white border-r border-gray-200 p-4 hidden md:flex flex-col">
          <div className="h-6 w-28 bg-gray-100 rounded animate-pulse mb-6" />
          <div className="space-y-1">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-7 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        </div>
        <div className="flex-1 flex flex-col overflow-y-auto">
          <div className="p-8">
            <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar - Cloudflare style */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col p-4 hidden md:flex">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 px-2 mb-6">
          <div className="w-6 h-6 bg-black rounded-sm flex items-center justify-center">
            <span className="text-white font-bold text-xs">N</span>
          </div>
          <span className="font-sans text-base font-semibold text-gray-900">
            Neolog
          </span>
        </Link>

        {/* Primary Navigation */}
        <nav className="flex-1 space-y-0.5">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
            const Icon = link.icon

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  flex items-center gap-2.5 px-2 py-1.5 rounded
                  text-sm transition-colors
                  ${isActive
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }
                `}
              >
                <Icon size={16} className="flex-shrink-0" />
                <span>{link.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-gray-200 pt-4 space-y-0.5">

          {/* Settings */}
          <Link
            href="/settings"
            className={`
              flex items-center gap-2.5 px-2 py-1.5 rounded
              text-sm transition-colors
              ${pathname === '/settings'
                ? 'bg-gray-100 text-gray-900 font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }
            `}
          >
            <Settings size={16} />
            <span>Settings</span>
          </Link>

          {/* User Profile */}
          {profile && (
            <Link
              href={`/${profile.username}`}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name || profile.username}
                  className="w-4 h-4 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <UserIcon size={16} className="flex-shrink-0" />
              )}
              <span className="truncate text-xs">
                {profile.display_name || profile.username}
              </span>
            </Link>
          )}

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-50 hover:text-red-600 transition-colors"
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
