'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { PostCard } from '@/components/PostCard'
import { PostCardListSkeleton, ProfileSkeleton } from '@/components/Skeleton'
import { 
  Search as SearchIcon, FileText, Users, Loader2, X
} from 'lucide-react'

type SearchResult = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  cover_image_url: string | null
  published_at: string
  reading_time_minutes: number | null
  author_id: string
  author_username: string
  author_display_name: string | null
  author_avatar_url: string | null
  rank: number
}

type UserResult = {
  id: string
  username: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  post_count: number
}

export default function SearchPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  
  const initialQuery = searchParams.get('q') || ''
  const initialSemantic = searchParams.get('semantic') === '1'
  
  const [query, setQuery] = useState(initialQuery)
  const [tab, setTab] = useState<'posts' | 'people'>('posts')
  const [semantic, setSemantic] = useState(initialSemantic)
  const [posts, setPosts] = useState<SearchResult[]>([])
  const [users, setUsers] = useState<UserResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery)
    }
  }, [initialQuery])

  const performSearch = useCallback(async (searchQuery: string, opts?: { semantic?: boolean }) => {
    if (!searchQuery.trim()) return
    
    setLoading(true)
    setSearched(true)
    setError(null)

    const useSemantic = Boolean(opts?.semantic)

    // Update URL
    const next = new URLSearchParams()
    next.set('q', searchQuery)
    if (useSemantic) next.set('semantic', '1')
    router.push(`/search?${next.toString()}`, { scroll: false })

    // Search posts
    if (useSemantic) {
      try {
        const res = await fetch(
          `/api/agent/vector-search?q=${encodeURIComponent(searchQuery)}&limit=25&seed=50&maxUpserts=10`,
          { headers: { accept: 'application/json' } },
        )
        const json = await res.json().catch(() => null)

        if (!res.ok) {
          setPosts([])
          setError(json?.error || 'Semantic search failed.')
        } else {
          const results = (json?.results || []) as any[]
          const mapped: SearchResult[] = results.map((r, i) => ({
            id: r.id,
            title: r.title,
            slug: r.slug,
            excerpt: r.excerpt ?? null,
            cover_image_url: r.cover_image_url ?? null,
            published_at: r.published_at,
            reading_time_minutes: r.reading_time_minutes ?? null,
            author_id: r.author_id,
            author_username: r.author?.username || 'unknown',
            author_display_name: null,
            author_avatar_url: null,
            rank: i + 1,
          }))

          setPosts(mapped)
        }
      } catch (e: any) {
        setPosts([])
        setError(e?.message || 'Semantic search failed.')
      }
    } else {
      const { data: postResults } = await supabase
        .rpc('search_posts', { p_query: searchQuery, p_limit: 30 })
      
      if (postResults) {
        setPosts(postResults)
      }
    }

    // Search users
    const { data: userResults } = await supabase
      .rpc('search_users', { p_query: searchQuery, p_limit: 20 })
    
    if (userResults) {
      setUsers(userResults)
    }

    setLoading(false)
  }, [router, supabase])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    performSearch(query, { semantic })
  }

  const clearSearch = () => {
    setQuery('')
    setPosts([])
    setUsers([])
    setSearched(false)
    setSemantic(false)
    setError(null)
    router.push('/search')
  }

  // Transform results for PostCard
  const transformedPosts = posts.map(post => ({
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    cover_image_url: post.cover_image_url,
    published_at: post.published_at,
    reading_time_minutes: post.reading_time_minutes,
    status: 'published' as const,
    author: {
      id: post.author_id,
      username: post.author_username,
      display_name: post.author_display_name,
      avatar_url: post.author_avatar_url,
    },
  }))

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          {/* Search header */}
          <div className="pt-8 mb-8">
            <h1 className="font-display text-3xl mb-6">Search</h1>
            
            <form onSubmit={handleSubmit} className="relative">
              <SearchIcon 
                size={20} 
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" 
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search posts and people..."
                className="input input-with-icon pr-12 py-3 text-lg"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  <X size={20} />
                </button>
              )}
            </form>

            <div className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                id="semantic"
                type="checkbox"
                checked={semantic}
                onChange={(e) => setSemantic(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="semantic" className="select-none">
                Semantic (requires login + OpenAI key or Pro)
              </label>
            </div>

            {error && (
              <div className="mt-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                {error}
              </div>
            )}
          </div>

          {/* Results */}
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <PostCardListSkeleton key={i} />
              ))}
            </div>
          ) : searched ? (
            <>
              {/* Tabs */}
              <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] rounded-lg mb-6 w-fit">
                <button
                  onClick={() => setTab('posts')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
                    tab === 'posts'
                      ? 'bg-[var(--bg-primary)] shadow-sm font-medium'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <FileText size={16} />
                  Posts
                  {posts.length > 0 && (
                    <span className="text-xs text-[var(--text-tertiary)]">
                      ({posts.length})
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setTab('people')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
                    tab === 'people'
                      ? 'bg-[var(--bg-primary)] shadow-sm font-medium'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Users size={16} />
                  People
                  {users.length > 0 && (
                    <span className="text-xs text-[var(--text-tertiary)]">
                      ({users.length})
                    </span>
                  )}
                </button>
              </div>

              {/* Posts tab */}
              {tab === 'posts' && (
                posts.length === 0 ? (
                  <div className="text-center py-16">
                    <FileText size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
                    <h2 className="font-display text-xl mb-2">No posts found</h2>
                    <p className="text-[var(--text-secondary)]">
                      Try a different search term
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {transformedPosts.map((post) => (
                      <PostCard key={post.id} post={post as any} variant="list" />
                    ))}
                  </div>
                )
              )}

              {/* People tab */}
              {tab === 'people' && (
                users.length === 0 ? (
                  <div className="text-center py-16">
                    <Users size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
                    <h2 className="font-display text-xl mb-2">No people found</h2>
                    <p className="text-[var(--text-secondary)]">
                      Try a different search term
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {users.map((user) => (
                      <Link
                        key={user.id}
                        href={`/${user.username}`}
                        className="flex items-center gap-4 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
                      >
                        {user.avatar_url ? (
                          <img 
                            src={user.avatar_url}
                            alt=""
                            className="w-12 h-12 rounded-full"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-medium text-lg">
                            {(user.display_name || user.username)[0].toUpperCase()}
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">
                            {user.display_name || user.username}
                          </p>
                          <p className="text-sm text-[var(--text-tertiary)]">
                            @{user.username}
                          </p>
                          {user.bio && (
                            <p className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-1">
                              {user.bio}
                            </p>
                          )}
                        </div>
                        
                        <div className="text-right">
                          <p className="text-sm text-[var(--text-tertiary)]">
                            {user.post_count} post{user.post_count !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <SearchIcon size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
              <h2 className="font-display text-xl mb-2">Search Neolog</h2>
              <p className="text-[var(--text-secondary)]">
                Find posts and people across the platform
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
