'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { 
  ArrowLeft, Eye, Clock, Users, Target,
  TrendingUp, TrendingDown, Minus
} from 'lucide-react'

type DropoffData = {
  scroll_bucket: number
  drop_count: number
  percentage: number
}

type PostData = {
  id: string
  title: string
  slug: string
  published_at: string
  content: string | null
}

type ViewData = {
  started_at: string
  time_on_page: number
  scroll_depth: number
  read_complete: boolean
  device_type: string | null
  referrer_domain: string | null
}

export default function PostAnalyticsPage() {
  const params = useParams()
  const postId = params.postId as string
  
  const [loading, setLoading] = useState(true)
  const [post, setPost] = useState<PostData | null>(null)
  const [views, setViews] = useState<ViewData[]>([])
  const [dropoff, setDropoff] = useState<DropoffData[]>([])
  const [stats, setStats] = useState({
    totalViews: 0,
    uniqueReaders: 0,
    avgTime: 0,
    avgScroll: 0,
    completionRate: 0,
  })
  
  const supabase = createClient()

  useEffect(() => {
    loadPostAnalytics()
  }, [postId])

  const loadPostAnalytics = async () => {
    // Get post
    const { data: postData } = await supabase
      .from('posts')
      .select('id, title, slug, published_at, content')
      .eq('id', postId)
      .single()

    if (!postData) {
      setLoading(false)
      return
    }

    setPost(postData)

    // Get views
    const { data: viewsData } = await supabase
      .from('post_views')
      .select('started_at, time_on_page, scroll_depth, read_complete, device_type, referrer_domain')
      .eq('post_id', postId)
      .order('started_at', { ascending: false })

    if (viewsData) {
      setViews(viewsData)

      // Calculate stats
      const uniqueSessions = viewsData.length // Each row is unique due to session constraint
      const avgTime = viewsData.length > 0
        ? Math.round(viewsData.reduce((sum, v) => sum + (v.time_on_page || 0), 0) / viewsData.length)
        : 0
      const avgScroll = viewsData.length > 0
        ? Math.round(viewsData.reduce((sum, v) => sum + (v.scroll_depth || 0), 0) / viewsData.length)
        : 0
      const completionRate = viewsData.length > 0
        ? Math.round((viewsData.filter(v => v.read_complete).length / viewsData.length) * 100)
        : 0

      setStats({
        totalViews: viewsData.length,
        uniqueReaders: uniqueSessions,
        avgTime,
        avgScroll,
        completionRate,
      })

      // Calculate drop-off data
      const scrollBuckets: { [bucket: number]: number } = {}
      viewsData.forEach(v => {
        const bucket = Math.floor((v.scroll_depth || 0) / 10) * 10
        scrollBuckets[bucket] = (scrollBuckets[bucket] || 0) + 1
      })

      // Convert to cumulative drop-off
      const dropoffData: DropoffData[] = []
      let remaining = viewsData.length
      
      for (let bucket = 0; bucket <= 100; bucket += 10) {
        const droppedHere = scrollBuckets[bucket] || 0
        dropoffData.push({
          scroll_bucket: bucket,
          drop_count: remaining,
          percentage: Math.round((remaining / viewsData.length) * 100),
        })
        remaining -= droppedHere
      }

      setDropoff(dropoffData)
    }

    setLoading(false)
  }

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  // Get content sections for drop-off context
  const getContentSections = (content: string | null) => {
    if (!content) return []
    
    // Extract headings from HTML
    const headingRegex = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi
    const headings: { text: string; position: number }[] = []
    let match
    
    while ((match = headingRegex.exec(content)) !== null) {
      const position = Math.round((match.index / content.length) * 100)
      const text = match[1].replace(/<[^>]*>/g, '') // Strip any nested tags
      headings.push({ text, position })
    }
    
    return headings
  }

  const contentSections = post ? getContentSections(post.content) : []

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          {/* Header */}
          <div className="pt-8 mb-8">
            <Link 
              href="/analytics"
              className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4 transition-colors"
            >
              <ArrowLeft size={16} />
              Back to Analytics
            </Link>
            
            {post && (
              <h1 className="font-display text-3xl">{post.title}</h1>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 rounded-xl skeleton" />
              ))}
            </div>
          ) : !post ? (
            <div className="text-center py-20">
              <p className="text-[var(--text-secondary)]">Post not found</p>
            </div>
          ) : (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye size={16} className="text-[var(--text-tertiary)]" />
                    <span className="text-sm text-[var(--text-secondary)]">Views</span>
                  </div>
                  <p className="font-display text-2xl">{stats.totalViews.toLocaleString()}</p>
                </div>

                <div className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock size={16} className="text-[var(--text-tertiary)]" />
                    <span className="text-sm text-[var(--text-secondary)]">Avg. Time</span>
                  </div>
                  <p className="font-display text-2xl">{formatTime(stats.avgTime)}</p>
                </div>

                <div className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp size={16} className="text-[var(--text-tertiary)]" />
                    <span className="text-sm text-[var(--text-secondary)]">Avg. Scroll</span>
                  </div>
                  <p className="font-display text-2xl">{stats.avgScroll}%</p>
                </div>

                <div className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Target size={16} className="text-[var(--text-tertiary)]" />
                    <span className="text-sm text-[var(--text-secondary)]">Completion</span>
                  </div>
                  <p className="font-display text-2xl">{stats.completionRate}%</p>
                </div>
              </div>

              {/* Drop-off visualization */}
              <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] p-6 mb-8">
                <h2 className="font-display text-xl mb-2">Reader Drop-off</h2>
                <p className="text-sm text-[var(--text-secondary)] mb-6">
                  See where readers stop scrolling. Lower bars mean more drop-off.
                </p>

                <div className="relative">
                  {/* Chart */}
                  <div className="flex items-end gap-1 h-48 mb-4">
                    {dropoff.map((d, i) => {
                      const isSignificantDrop = i > 0 && 
                        (dropoff[i-1].percentage - d.percentage) > 10
                      
                      return (
                        <div 
                          key={d.scroll_bucket}
                          className="flex-1 flex flex-col items-center group"
                        >
                          <div className="relative w-full">
                            {/* Bar */}
                            <div
                              className={`w-full rounded-t transition-all ${
                                isSignificantDrop 
                                  ? 'bg-[var(--error)]' 
                                  : 'bg-[var(--accent)]'
                              } ${
                                isSignificantDrop ? 'opacity-100' : 'opacity-70'
                              } group-hover:opacity-100`}
                              style={{ height: `${(d.percentage / 100) * 180}px` }}
                            />
                            
                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--bg-inverse)] text-[var(--text-inverse)] text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                              {d.percentage}% still reading
                              {isSignificantDrop && (
                                <span className="text-red-300 block">
                                  ⚠️ High drop-off here
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* X-axis labels */}
                  <div className="flex gap-1">
                    {dropoff.map((d) => (
                      <div 
                        key={d.scroll_bucket}
                        className="flex-1 text-center text-xs text-[var(--text-tertiary)]"
                      >
                        {d.scroll_bucket}%
                      </div>
                    ))}
                  </div>

                  {/* Content section markers */}
                  {contentSections.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-[var(--border-light)]">
                      <p className="text-xs text-[var(--text-tertiary)] mb-3">
                        Content sections:
                      </p>
                      <div className="relative h-6">
                        {contentSections.map((section, i) => (
                          <div
                            key={i}
                            className="absolute top-0 transform -translate-x-1/2"
                            style={{ left: `${section.position}%` }}
                          >
                            <div className="w-0.5 h-3 bg-[var(--text-tertiary)]" />
                            <p className="text-[10px] text-[var(--text-tertiary)] mt-1 whitespace-nowrap max-w-[80px] truncate">
                              {section.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Insights */}
                <div className="mt-6 p-4 rounded-lg bg-[var(--bg-tertiary)]">
                  <h3 className="text-sm font-medium mb-2">Insights</h3>
                  <ul className="text-sm text-[var(--text-secondary)] space-y-1">
                    {stats.completionRate >= 70 && (
                      <li className="flex items-center gap-2">
                        <TrendingUp size={14} className="text-[var(--success)]" />
                        Great completion rate! Most readers finish your post.
                      </li>
                    )}
                    {stats.completionRate < 30 && (
                      <li className="flex items-center gap-2">
                        <TrendingDown size={14} className="text-[var(--error)]" />
                        Low completion rate. Consider a stronger hook or shorter content.
                      </li>
                    )}
                    {stats.avgScroll < 50 && stats.avgScroll > 0 && (
                      <li className="flex items-center gap-2">
                        <Minus size={14} className="text-[var(--warning)]" />
                        Readers often leave before halfway. Try front-loading your best content.
                      </li>
                    )}
                    {dropoff.some((d, i) => i > 0 && (dropoff[i-1].percentage - d.percentage) > 15) && (
                      <li className="flex items-center gap-2">
                        <TrendingDown size={14} className="text-[var(--error)]" />
                        Significant drop-off detected. Check the highlighted section.
                      </li>
                    )}
                    {stats.avgTime > 0 && stats.avgTime < 30 && (
                      <li className="flex items-center gap-2">
                        <Clock size={14} className="text-[var(--warning)]" />
                        Very short read times. Your intro may need work.
                      </li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Recent views table */}
              <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] overflow-hidden">
                <div className="p-4 border-b border-[var(--border-light)]">
                  <h2 className="font-display text-lg">Recent Readers</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[var(--border-light)] text-sm text-[var(--text-tertiary)]">
                        <th className="text-left p-4 font-medium">Time</th>
                        <th className="text-left p-4 font-medium">Source</th>
                        <th className="text-left p-4 font-medium">Device</th>
                        <th className="text-right p-4 font-medium">Read Time</th>
                        <th className="text-right p-4 font-medium">Scroll</th>
                        <th className="text-right p-4 font-medium">Finished</th>
                      </tr>
                    </thead>
                    <tbody>
                      {views.slice(0, 20).map((view, i) => (
                        <tr 
                          key={i}
                          className="border-b border-[var(--border-light)] last:border-0"
                        >
                          <td className="p-4 text-sm">
                            {new Date(view.started_at).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="p-4 text-sm text-[var(--text-secondary)]">
                            {view.referrer_domain || 'Direct'}
                          </td>
                          <td className="p-4 text-sm text-[var(--text-secondary)] capitalize">
                            {view.device_type || '—'}
                          </td>
                          <td className="p-4 text-right font-mono text-sm">
                            {formatTime(view.time_on_page || 0)}
                          </td>
                          <td className="p-4 text-right font-mono text-sm">
                            {view.scroll_depth || 0}%
                          </td>
                          <td className="p-4 text-right">
                            {view.read_complete ? (
                              <span className="text-[var(--success)]">✓</span>
                            ) : (
                              <span className="text-[var(--text-tertiary)]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  )
}
