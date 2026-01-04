'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { CuratorBadge } from '@/components/CuratorBadge'
import { 
  Award, TrendingUp, Eye, Users, Sparkles,
  ArrowUpRight, Clock
} from 'lucide-react'

type Curator = {
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  score: number
  early_upvotes: number
  expertise_domains: { domain: string; score: number; post_count: number }[]
}

type RisingPost = {
  post_id: string
  title: string
  slug: string
  author_username: string
  author_display_name: string | null
  total_views: number
  upvote_count: number
  engagement_ratio: number
  published_at: string
}

export default function CuratorsPage() {
  const [loading, setLoading] = useState(true)
  const [curators, setCurators] = useState<Curator[]>([])
  const [risingPosts, setRisingPosts] = useState<RisingPost[]>([])
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    // Get top curators
    const { data: curatorsData } = await supabase
      .rpc('get_top_curators', { limit_count: 20 })

    if (curatorsData) {
      setCurators(curatorsData)
    }

    // Get rising posts
    const { data: risingData } = await supabase
      .rpc('get_rising_posts', { limit_count: 10 })

    if (risingData) {
      setRisingPosts(risingData)
    }

    setLoading(false)
  }

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    return 'Just now'
  }

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          {/* Header */}
          <div className="pt-8 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                <Award size={24} className="text-[var(--accent)]" />
              </div>
              <div>
                <h1 className="font-display text-3xl">Curators</h1>
                <p className="text-[var(--text-secondary)]">
                  People who consistently find great content early
                </p>
              </div>
            </div>
          </div>

          {/* Explanation */}
          <div className="mb-12 p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
            <h2 className="font-display text-lg mb-3">How curator scores work</h2>
            <div className="grid md:grid-cols-3 gap-6 text-sm">
              <div>
                <div className="flex items-center gap-2 mb-2 text-[var(--accent)]">
                  <Eye size={16} />
                  <span className="font-medium">Early Discovery</span>
                </div>
                <p className="text-[var(--text-secondary)]">
                  Upvote posts before they have 100 views. If they later get 500+ views, you get points.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2 text-[var(--accent)]">
                  <TrendingUp size={16} />
                  <span className="font-medium">Quality Taste</span>
                </div>
                <p className="text-[var(--text-secondary)]">
                  Upvote posts that readers actually finish. High completion rates = quality signal.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2 text-[var(--accent)]">
                  <Sparkles size={16} />
                  <span className="font-medium">Expertise Domains</span>
                </div>
                <p className="text-[var(--text-secondary)]">
                  Your upvotes reveal what topics you know. This helps surface your recommendations.
                </p>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Curator Leaderboard */}
            <div className="lg:col-span-2">
              <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] overflow-hidden">
                <div className="p-4 border-b border-[var(--border-light)] flex items-center justify-between">
                  <h2 className="font-display text-lg">Top Curators</h2>
                  <Users size={18} className="text-[var(--text-tertiary)]" />
                </div>

                {loading ? (
                  <div className="p-8">
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-16 skeleton rounded-lg" />
                      ))}
                    </div>
                  </div>
                ) : curators.length === 0 ? (
                  <div className="p-8 text-center">
                    <Users size={32} className="mx-auto mb-3 text-[var(--text-tertiary)]" />
                    <p className="text-[var(--text-secondary)]">
                      No curators yet. Be the first to upvote great content!
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-light)]">
                    {curators.map((curator, index) => (
                      <Link
                        key={curator.user_id}
                        href={`/${curator.username}`}
                        className="flex items-center gap-4 p-4 hover:bg-[var(--bg-tertiary)] transition-colors"
                      >
                        {/* Rank */}
                        <div className={`
                          w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                          ${index === 0 ? 'bg-amber-500/20 text-amber-600' :
                            index === 1 ? 'bg-gray-300/20 text-gray-500' :
                            index === 2 ? 'bg-orange-400/20 text-orange-500' :
                            'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'}
                        `}>
                          {index + 1}
                        </div>

                        {/* Avatar */}
                        {curator.avatar_url ? (
                          <img 
                            src={curator.avatar_url}
                            alt={curator.display_name || curator.username}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-medium">
                            {(curator.display_name || curator.username)[0].toUpperCase()}
                          </div>
                        )}

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {curator.display_name || curator.username}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                            <span>@{curator.username}</span>
                            {curator.early_upvotes > 0 && (
                              <>
                                <span>-</span>
                                <span>{curator.early_upvotes} early finds</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Expertise domains */}
                        <div className="hidden md:flex gap-1">
                          {curator.expertise_domains?.slice(0, 3).map((domain, i) => (
                            <span 
                              key={i}
                              className="px-2 py-0.5 text-xs rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]"
                            >
                              {domain.domain}
                            </span>
                          ))}
                        </div>

                        {/* Score */}
                        <CuratorBadge score={curator.score} size="md" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Rising Posts */}
            <div>
              <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] overflow-hidden">
                <div className="p-4 border-b border-[var(--border-light)] flex items-center justify-between">
                  <h2 className="font-display text-lg">Rising Posts</h2>
                  <TrendingUp size={18} className="text-[var(--accent)]" />
                </div>

                {loading ? (
                  <div className="p-4 space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-20 skeleton rounded-lg" />
                    ))}
                  </div>
                ) : risingPosts.length === 0 ? (
                  <div className="p-8 text-center">
                    <TrendingUp size={32} className="mx-auto mb-3 text-[var(--text-tertiary)]" />
                    <p className="text-[var(--text-secondary)] text-sm">
                      No rising posts yet
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-light)]">
                    {risingPosts.map((post) => (
                      <Link
                        key={post.post_id}
                        href={`/${post.author_username}/${post.slug}`}
                        className="block p-4 hover:bg-[var(--bg-tertiary)] transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-medium text-sm line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                            {post.title}
                          </h3>
                          <ArrowUpRight size={14} className="text-[var(--text-tertiary)] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
                          <span>{post.author_display_name || post.author_username}</span>
                          <span>-</span>
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {formatTimeAgo(post.published_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          <span className="text-[var(--text-secondary)]">
                            {post.total_views} views
                          </span>
                          <span className="text-[var(--accent)] font-medium">
                            {post.upvote_count} upvotes
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Call to action */}
              <div className="mt-6 p-4 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/20">
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  <strong className="text-[var(--text-primary)]">Want to become a top curator?</strong>
                  <br />
                  Upvote posts early. If they perform well, your score goes up.
                </p>
                <Link href="/explore" className="btn btn-primary btn-sm">
                  Browse new posts
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}

