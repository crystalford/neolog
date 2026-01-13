'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FileText, Users, Eye } from 'lucide-react'

export function PlatformStats() {
  const [stats, setStats] = useState({ posts: 0, writers: 0, views: 0 })
  const supabase = createClient()

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    const [postsRes, writersRes] = await Promise.all([
      supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
    ])
    
    setStats({
      posts: postsRes.count || 0,
      writers: writersRes.count || 0,
      views: Math.floor((postsRes.count || 0) * 127), // Placeholder
    })
  }

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toString()
  }

  return (
    <div className="grid grid-cols-3 gap-4 mb-12">
      {[
        { label: 'Published Posts', value: stats.posts, icon: FileText },
        { label: 'Writers', value: stats.writers, icon: Users },
        { label: 'Total Views', value: stats.views, icon: Eye },
      ].map(({ label, value, icon: Icon }) => (
        <div key={label} className="text-center p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <Icon size={20} className="mx-auto mb-2 text-[var(--accent)]" />
          <p className="font-display text-2xl">{formatNumber(value)}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
        </div>
      ))}
    </div>
  )
}
