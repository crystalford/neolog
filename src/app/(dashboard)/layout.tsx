'use client'

export const runtime = 'edge'

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

// Use a typed dynamic import for the Command Palette (Named Export)
const DashboardCommandPalette = dynamic(
  () => import('@/components/DashboardCommandPalette').then((mod) => ({ default: mod.DashboardCommandPalette })),
  { ssr: false }
)

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function getUser() {
      // In Edge Runtime, session might need careful handling if Supabase isn't configured for it
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  const navigation = [
    { name: 'Control Room', href: '/dashboard', icon: Home },
    { name: 'Timeline', href: '/dashboard/timeline', icon: List },
    { name: 'Archive', href: '/dashboard/uploads', icon: Inbox },
    { name: 'Queue', href: '/dashboard/queue', icon: Share2 },
    { name: 'Synthesis', href: '/dashboard/synthesis', icon: Sparkles },
    { name: 'Entities', href: '/dashboard/entities', icon: Cpu },
    { name: 'Studio', href: '/dashboard/studio', icon: Video },
  ]

  const commandItems = [
    ...navigation.map(n => ({ label: `Go to ${n.name}`, href: n.href, description: `Navigate to the ${n.name} module.` })),
    { label: 'Upload Signal', href: '/dashboard/uploads', description: 'Upload a new video or audio recording.' },
    { label: 'Manage Profile', href: '/dashboard/profile', description: 'Update your user profile and identity settings.' },
    { label: 'System Settings', href: '/dashboard/settings', description: 'Configure project-wide parameters.' },
  ]

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)] font-mono text-xs uppercase tracking-[0.3em] text-[var(--text-tertiary)] animate-pulse">
        Initializing Terminal...
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans">
      <DashboardCommandPalette
        items={commandItems}
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpen={() => setIsCommandPaletteOpen(true)}
      />

      {/* Persistent Technical Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-[var(--border-light)] bg-[var(--bg-card)]/30 backdrop-blur-3xl transition-transform lg:translate-x-0 lg:static lg:inset-0 lg:block ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex flex-col h-full">
          
          {/* Logo & System Pulse */}
          <div className="px-8 py-10">
            <Link href="/" className="block">
              <Logo size="default" />
            </Link>
            
            <div className="mt-8 p-4 rounded-2xl bg-[var(--bg-secondary)]/50 border border-[var(--border-light)] space-y-3">
               <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)]">System Pulse</span>
                  <div className="flex gap-1">
                     <div className="w-1 h-3 rounded-full bg-[var(--accent)] animate-pulse" />
                     <div className="w-1 h-3 rounded-full bg-[var(--accent)] animate-pulse delay-75" />
                     <div className="w-1 h-3 rounded-full bg-[var(--accent)] animate-pulse delay-150" />
                  </div>
               </div>
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-mono uppercase text-emerald-500 font-bold">Encrypted Link Active</span>
               </div>
            </div>
          </div>

          {/* User Meta (Technical Data) */}
          <div className="px-8 mb-6">
            <div className="p-4 rounded-xl border border-[var(--border-light)] bg-black/20 font-mono text-[9px] text-[var(--text-tertiary)] uppercase tracking-widest space-y-2">
               <div className="flex justify-between">
                  <span>Authorized</span>
                  <span className="text-[var(--text-secondary)]">{user?.user_metadata?.username || 'GUEST'}</span>
               </div>
               <div className="flex justify-between">
                  <span>Level</span>
                  <span className="text-[var(--accent)]">Admin</span>
               </div>
               <div className="flex justify-between overflow-hidden">
                  <span>Session</span>
                  <span className="truncate ml-4">{user?.id?.slice(0, 12) || '---'}</span>
               </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
            <p className="px-4 mb-4 text-[9px] font-mono font-bold uppercase tracking-[0.3em] text-[var(--text-tertiary)]">Main Terminal</p>
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${
                    isActive 
                      ? 'bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 shadow-[0_0_20px_rgba(124,106,245,0.1)]' 
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <item.icon size={18} className={isActive ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)] group-hover:text-[var(--accent)]'} />
                  <span className="text-sm font-bold tracking-tight">{item.name}</span>
                  {isActive && (
                    <div className="ml-auto w-1 h-1 rounded-full bg-[var(--accent)] shadow-[0_0_5px_var(--accent)]" />
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Utility Footer */}
          <div className="p-4 border-t border-[var(--border-light)] space-y-1">
             <button
               onClick={() => setIsCommandPaletteOpen(true)}
               className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-white transition-all group border border-transparent hover:border-[var(--border-light)]"
             >
               <div className="flex items-center gap-3">
                 <Command size={18} className="text-[var(--text-tertiary)] group-hover:text-[var(--accent)]" />
                 <span className="text-sm font-bold">Command Palette</span>
               </div>
               <span className="text-[10px] font-mono text-[var(--text-tertiary)] bg-black/40 px-1.5 py-0.5 rounded border border-white/5">⌘/</span>
             </button>

             <Link
               href="/dashboard/settings"
               className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                 pathname === '/dashboard/settings' ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
               }`}
             >
               <Settings size={18} className="text-[var(--text-tertiary)]" />
               <span className="text-sm font-bold">Preferences</span>
             </Link>

             <button
               onClick={handleSignOut}
               className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-rose-400/70 hover:bg-rose-500/10 hover:text-rose-400 transition-all font-bold text-sm"
             >
               <LogOut size={18} />
               <span>Terminate Session</span>
             </button>
          </div>
        </div>
      </aside>

      {/* Main Content Viewport */}
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 flex flex-col min-w-0 bg-[var(--bg-primary)] relative h-screen">
        {/* Mobile Header (Hidden on Desktop) */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-[var(--border-light)] bg-[var(--bg-card)]/50 backdrop-blur-md sticky top-0 z-20">
          <Link href="/" className="block">
            <Logo size="default" />
          </Link>
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-secondary)]"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
        </div>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] pointer-events-none" />
        <div className="flex-1 overflow-y-auto relative z-10 custom-scrollbar">
          {children}
        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  )
}
