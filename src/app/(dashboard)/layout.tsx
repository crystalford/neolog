'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import {
  LayoutDashboard, BookOpen, BarChart3, Mail, Layers, Gift,
  Zap, DollarSign, Users, Settings, LogOut, User as UserIcon
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
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/publications', icon: BookOpen, label: 'Publications' },
    { href: '/analytics', icon: BarChart3, label: 'Analytics' },
    { href: '/subscribers', icon: Mail, label: 'Subscribers' },
    { href: '/series', icon: Layers, label: 'Series' },
    { href: '/referrals', icon: Gift, label: 'Referrals' },
    { href: '/boost', icon: Zap, label: 'Boost' },
    { href: '/earnings', icon: DollarSign, label: 'Earnings' },
    { href: '/curators', icon: Users, label: 'Curators' },
  ]

  if (loading) {
    return (
      <div className="flex h-screen bg-white overflow-hidden">
        <div className="w-64 border-r border-gray-200 p-6 hidden md:flex flex-col">
          <div className="h-8 w-32 bg-gray-100 rounded animate-pulse mb-8" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
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
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 flex flex-col justify-between p-6 hidden md:flex">
        {/* Logo & Nav */}
        <div>
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 mb-8">
            <div className="w-7 h-7 bg-black rounded-sm flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="font-serif text-xl tracking-tight text-gray-900">
              Neolog
            </span>
          </Link>

          {/* Primary Navigation */}
          <nav className="space-y-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
              const Icon = link.icon

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-md
                    font-sans text-sm font-medium
                    transition-colors
                    ${isActive
                      ? 'bg-gray-100 text-black'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-black'
                    }
                  `}
                >
                  <Icon size={18} />
                  {link.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* User Profile Section */}
        <div className="border-t border-gray-200 pt-4 space-y-2">
          {/* Settings */}
          <Link
            href="/settings"
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-md
              font-sans text-sm font-medium
              transition-colors
              ${pathname === '/settings'
                ? 'bg-gray-100 text-black'
                : 'text-gray-600 hover:bg-gray-50 hover:text-black'
              }
            `}
          >
            <Settings size={18} />
            Settings
          </Link>

          {/* User Profile */}
          {profile && (
            <Link
              href={`/${profile.username}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-gray-600 hover:bg-gray-50 hover:text-black transition-colors"
            >
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name || profile.username}
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <UserIcon size={18} />
              )}
              <span className="font-sans text-sm font-medium truncate">
                {profile.display_name || profile.username}
              </span>
            </Link>
          )}

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-gray-600 hover:bg-gray-50 hover:text-red-600 transition-colors font-sans text-sm font-medium"
          >
            <LogOut size={18} />
            Sign out
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
