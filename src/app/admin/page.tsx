'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { 
  Shield, Users, FileText, MessageSquare, TrendingUp,
  AlertTriangle, Star, Loader2, Eye, Check, X, ChevronRight
} from 'lucide-react'

type AdminStats = {
  total_users: number
  total_posts: number
  total_comments: number
  posts_today: number
  users_today: number
  pending_reports: number
}

type Report = {
  id: string
  content_type: string
  content_id: string
  reason: string
  description: string | null
  status: string
  created_at: string
  reporter: { username: string } | null
}

type FeaturedWriter = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  is_featured: boolean
  post_count: number
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [featuredWriters, setFeaturedWriters] = useState<FeaturedWriter[]>([])
  const [topWriters, setTopWriters] = useState<FeaturedWriter[]>([])
  const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'featured'>('overview')
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAdmin()
  }, [])

  const checkAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login')
      return
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', session.user.id)
      .single()

    if (!profile?.is_admin) {
      router.push('/')
      return
    }

    setIsAdmin(true)
    loadData()
  }

  const loadData = async () => {
    // Get stats
    const { data: statsData } = await supabase.rpc('get_admin_stats')
    if (statsData && statsData[0]) {
      setStats(statsData[0])
    }

    // Get pending reports
    const { data: reportsData } = await supabase
      .from('reports')
      .select('*, reporter:profiles(username)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20)

    if (reportsData) {
      setReports(reportsData)
    }

    // Get featured writers
    const { data: featured } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_featured')
      .eq('is_featured', true)

    if (featured) {
      setFeaturedWriters(featured as FeaturedWriter[])
    }

    // Get top writers by post count
    const { data: top } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_featured')
      .order('post_count', { ascending: false })
      .limit(20)

    if (top) {
      setTopWriters(top as FeaturedWriter[])
    }

    setLoading(false)
  }

  const handleReportAction = async (reportId: string, action: 'resolved' | 'dismissed') => {
    const { data: { session } } = await supabase.auth.getSession()
    
    await supabase
      .from('reports')
      .update({
        status: action,
        reviewed_by: session?.user?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', reportId)

    setReports(reports.filter(r => r.id !== reportId))
  }

  const toggleFeatured = async (userId: string, currentlyFeatured: boolean) => {
    await supabase
      .from('profiles')
      .update({ 
        is_featured: !currentlyFeatured,
        featured_at: !currentlyFeatured ? new Date().toISOString() : null,
      })
      .eq('id', userId)

    loadData()
  }

  if (loading) {
    return (
      <>
        <Header />
        <main className="pt-16 pb-16 flex items-center justify-center min-h-screen">
          <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
        </main>
      </>
    )
  }

  if (!isAdmin) return null

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex items-center gap-4 pt-8 mb-8">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
              <Shield size={24} className="text-[var(--accent)]" />
            </div>
            <div>
              <h1 className="font-display text-3xl">Admin Dashboard</h1>
              <p className="text-[var(--text-secondary)]">Platform management</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] rounded-lg mb-8 w-fit">
            {[
              { id: 'overview', label: 'Overview', icon: TrendingUp },
              { id: 'reports', label: `Reports (${stats?.pending_reports || 0})`, icon: AlertTriangle },
              { id: 'featured', label: 'Featured Writers', icon: Star },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-all ${
                  activeTab === id
                    ? 'bg-[var(--bg-primary)] shadow-sm font-medium'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          {/* Overview */}
          {activeTab === 'overview' && stats && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard icon={Users} label="Total Users" value={stats.total_users} subvalue={`+${stats.users_today} today`} />
              <StatCard icon={FileText} label="Total Posts" value={stats.total_posts} subvalue={`+${stats.posts_today} today`} />
              <StatCard icon={MessageSquare} label="Total Comments" value={stats.total_comments} />
              <StatCard icon={AlertTriangle} label="Pending Reports" value={stats.pending_reports} accent />
            </div>
          )}

          {/* Reports */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              {reports.length === 0 ? (
                <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)]">
                  <Check size={48} className="mx-auto mb-4 text-[var(--success)]" />
                  <h2 className="font-display text-xl mb-2">All caught up!</h2>
                  <p className="text-[var(--text-secondary)]">No pending reports</p>
                </div>
              ) : (
                reports.map(report => (
                  <div key={report.id} className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                            report.reason === 'harassment' || report.reason === 'hate_speech'
                              ? 'bg-[var(--error)]/10 text-[var(--error)]'
                              : 'bg-[var(--warning)]/10 text-[var(--warning)]'
                          }`}>
                            {report.reason.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-[var(--text-tertiary)]">
                            {report.content_type} · {new Date(report.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {report.description && (
                          <p className="text-sm text-[var(--text-secondary)] mb-2">{report.description}</p>
                        )}
                        <p className="text-xs text-[var(--text-tertiary)]">
                          Reported by @{report.reporter?.username || 'anonymous'}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleReportAction(report.id, 'resolved')}
                          className="p-2 rounded-lg bg-[var(--success)]/10 text-[var(--success)] hover:bg-[var(--success)]/20"
                          title="Mark resolved"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => handleReportAction(report.id, 'dismissed')}
                          className="p-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-light)]"
                          title="Dismiss"
                        >
                          <X size={16} />
                        </button>
                        <Link
                          href={`/${report.content_type === 'post' ? 'admin/post' : 'admin/comment'}/${report.content_id}`}
                          className="p-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-light)]"
                          title="View content"
                        >
                          <Eye size={16} />
                        </Link>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Featured Writers */}
          {activeTab === 'featured' && (
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Current featured */}
              <div>
                <h2 className="font-display text-xl mb-4">Currently Featured</h2>
                <div className="space-y-2">
                  {featuredWriters.length === 0 ? (
                    <p className="text-[var(--text-tertiary)] py-8 text-center">No featured writers yet</p>
                  ) : (
                    featuredWriters.map(writer => (
                      <div key={writer.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)]">
                        <Link href={`/${writer.username}`} className="flex items-center gap-3">
                          {writer.avatar_url ? (
                            <img src={writer.avatar_url} className="w-10 h-10 rounded-full" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-medium">
                              {(writer.display_name || writer.username)[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{writer.display_name || writer.username}</p>
                            <p className="text-sm text-[var(--text-tertiary)]">@{writer.username}</p>
                          </div>
                        </Link>
                        <button
                          onClick={() => toggleFeatured(writer.id, true)}
                          className="text-sm text-[var(--error)] hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Top writers */}
              <div>
                <h2 className="font-display text-xl mb-4">Top Writers</h2>
                <div className="space-y-2">
                  {topWriters.map(writer => (
                    <div key={writer.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)]">
                      <Link href={`/${writer.username}`} className="flex items-center gap-3">
                        {writer.avatar_url ? (
                          <img src={writer.avatar_url} className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-medium">
                            {(writer.display_name || writer.username)[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{writer.display_name || writer.username}</p>
                          <p className="text-sm text-[var(--text-tertiary)]">@{writer.username}</p>
                        </div>
                      </Link>
                      {writer.is_featured ? (
                        <Star size={16} className="text-[var(--warning)]" fill="currentColor" />
                      ) : (
                        <button
                          onClick={() => toggleFeatured(writer.id, false)}
                          className="text-sm text-[var(--accent)] hover:underline"
                        >
                          Feature
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  )
}

function StatCard({ icon: Icon, label, value, subvalue, accent }: { 
  icon: any
  label: string
  value: number
  subvalue?: string
  accent?: boolean 
}) {
  return (
    <div className={`p-5 rounded-xl border ${
      accent 
        ? 'bg-[var(--warning)]/5 border-[var(--warning)]/20' 
        : 'bg-[var(--bg-secondary)] border-[var(--border-light)]'
    }`}>
      <div className="flex items-center gap-2 text-[var(--text-tertiary)] mb-2">
        <Icon size={16} />
        <span className="text-sm">{label}</span>
      </div>
      <p className="font-display text-3xl">{value.toLocaleString()}</p>
      {subvalue && (
        <p className="text-xs text-[var(--text-tertiary)] mt-1">{subvalue}</p>
      )}
    </div>
  )
}
