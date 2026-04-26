'use client'

export const runtime = 'edge'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const C = {
  bg:          '#070706',
  bgSurface:   '#0e0d0b',
  border:      '#1e1b16',
  borderBright:'#2c2820',
  amber:       '#C8902A',
  amberBright: '#E8A840',
  amberGlow:   'rgba(200,144,42,0.09)',
  textPrimary: '#EDE3CC',
  textSecond:  '#9A8E78',
  textDim:     '#5A5040',
  textDimmer:  '#2e2820',
  green:       '#4A8A60',
}

const NAV = [
  { id: 'home',     label: 'Home',     href: '/dashboard',          icon: '⌂' },
  { id: 'videos',   label: 'Videos',   href: '/dashboard/videos',   icon: '▶' },
  { id: 'timeline', label: 'Timeline', href: '/dashboard/timeline', icon: '≡' },
  { id: 'posts',    label: 'Posts',    href: '/dashboard/posts',    icon: '↗' },
  { id: 'studio',    label: 'Studio',    href: '/dashboard/studio',    icon: '◈' },
  { id: 'character', label: 'Character', href: '/dashboard/character', icon: '◉' },
  { id: 'system',    label: 'System',    href: '/dashboard/system',    icon: '⟳' },
  { id: 'settings',  label: 'Settings',  href: '/dashboard/settings',  icon: '⚙' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [sessionCount, setSessionCount] = useState<number>(0)
  const [postsCount, setPostsCount] = useState<number>(0)
  const [voiceReady, setVoiceReady] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setLoading(false)

      // Load sidebar stats in background — non-blocking
      const [
        { count: uploadCount },
        { count: pendingPosts },
      ] = await Promise.all([
        supabase.from('video_uploads').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id),
        supabase.from('post_candidates').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('status', 'ready'),
      ])
      setSessionCount(uploadCount ?? 0)
      setPostsCount(pendingPosts ?? 0)
    }
    init()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        height: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        background: C.bg,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        letterSpacing: 3,
        color: C.textDimmer,
        textTransform: 'uppercase',
      }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg }}>
      {/* Sidebar */}
      <aside style={{
        width: 196,
        flexShrink: 0,
        height: '100vh',
        background: C.bgSurface,
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Wordmark */}
        <div style={{
          padding: '22px 20px 18px',
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 20,
            letterSpacing: -0.5,
            color: C.textPrimary,
          }}>
            NEO<span style={{ color: C.amber }}>LOG</span>
          </div>
          <div style={{
            fontSize: 9,
            color: C.textDim,
            letterSpacing: 2,
            marginTop: 3,
          }}>
            CREATIVE INTELLIGENCE
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
          {NAV.map(item => {
            const isActive = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)
            const badge = item.id === 'posts' && postsCount > 0 ? postsCount : null
            return (
              <Link
                key={item.id}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  width: '100%',
                  padding: '10px 20px',
                  background: isActive ? C.amberGlow : 'none',
                  borderLeft: isActive ? `2px solid ${C.amber}` : '2px solid transparent',
                  color: isActive ? C.amberBright : C.textDim,
                  fontSize: 12,
                  transition: 'all 0.12s',
                  textDecoration: 'none',
                }}
              >
                <span style={{ fontSize: 13, opacity: 0.8, width: 16 }}>{item.icon}</span>
                {item.label}
                {badge && (
                  <span style={{
                    marginLeft: 'auto',
                    background: C.amber,
                    color: C.bg,
                    fontSize: 8,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 2,
                  }}>
                    {badge}
                  </span>
                )}
              </Link>
            )
          })}

          {/* Experimental separator */}
          <div style={{ margin: '10px 20px 4px', borderTop: `1px solid ${C.border}` }} />
          <div style={{ padding: '2px 20px 6px', fontSize: 7, letterSpacing: 2, color: C.textDimmer, textTransform: 'uppercase' as const }}>
            Experimental
          </div>
          <Link
            href="/dashboard/brain"
            style={{
              display: 'flex', alignItems: 'center', gap: 11,
              width: '100%', padding: '10px 20px',
              background: pathname.startsWith('/dashboard/brain') ? C.amberGlow : 'none',
              borderLeft: pathname.startsWith('/dashboard/brain') ? `2px solid ${C.amber}` : '2px solid transparent',
              color: pathname.startsWith('/dashboard/brain') ? C.amberBright : C.textDim,
              fontSize: 12, transition: 'all 0.12s', textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: 13, opacity: 0.8, width: 16 }}>◉</span>
            Brain
            <span style={{ marginLeft: 'auto', fontSize: 7, letterSpacing: 1, color: C.amberDim, textTransform: 'uppercase' as const }}>β</span>
          </Link>
        </nav>

        {/* Footer status */}
        <div style={{
          padding: '14px 20px',
          borderTop: `1px solid ${C.border}`,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 6,
          }}>
            <span style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: C.green,
              animation: 'pulse 2s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>
              ACTIVE · {sessionCount} SESSION{sessionCount !== 1 ? 'S' : ''}
            </span>
          </div>
          <div style={{ fontSize: 9, color: C.textDimmer, letterSpacing: 1 }}>
            {voiceReady ? 'voice clone ready' : 'voice not configured'}
          </div>
          <button
            onClick={handleSignOut}
            style={{
              marginTop: 10,
              background: 'none',
              border: 'none',
              fontSize: 9,
              color: C.textDimmer,
              letterSpacing: 1,
              cursor: 'pointer',
              textTransform: 'uppercase',
              padding: 0,
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{
        flex: 1,
        overflow: 'hidden',
        animation: 'fadeIn 0.18s ease',
      }}>
        {children}
      </main>
    </div>
  )
}
