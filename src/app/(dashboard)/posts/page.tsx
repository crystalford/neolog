'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'
import { MoreHorizontal, ExternalLink, Edit2, Trash2 } from 'lucide-react'

type PostStatus = 'published' | 'scheduled' | 'draft'

interface Post {
  id: string
  title: string | null
  slug: string
  status: PostStatus
  published_at: string | null
  scheduled_at: string | null
  updated_at: string
}

export default function PostsPage() {
  const [activeTab, setActiveTab] = useState<PostStatus>('published')
  const [posts, setPosts] = useState<Post[]>([])
  const [counts, setCounts] = useState({ published: 0, scheduled: 0, draft: 0 })
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadCounts()
  }, [])

  useEffect(() => {
    loadPosts()
  }, [activeTab])

  const loadCounts = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // Load counts for all statuses
    const [publishedCount, scheduledCount, draftCount] = await Promise.all([
      supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', session.user.id)
        .eq('status', 'published'),
      supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', session.user.id)
        .eq('status', 'scheduled'),
      supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', session.user.id)
        .eq('status', 'draft'),
    ])

    setCounts({
      published: publishedCount.count || 0,
      scheduled: scheduledCount.count || 0,
      draft: draftCount.count || 0,
    })
  }

  const loadPosts = async () => {
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    // Get username
    if (!username) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', session.user.id)
        .single()
      setUsername(profile?.username || null)
    }

    // Load posts for active tab
    const { data, error } = await supabase
      .from('posts')
      .select('id, title, slug, status, published_at, scheduled_at, updated_at, author_id, publication_id')
      .eq('author_id', session.user.id)
      .eq('status', activeTab)
      .order(activeTab === 'published' ? 'published_at' : 'updated_at', { ascending: false })
      .limit(50)

    console.log('[Posts Page] Loaded posts:', {
      tab: activeTab,
      count: data?.length || 0,
      error,
      userId: session.user.id,
      posts: data
    })

    if (error) {
      console.error('[Posts Page] Error:', error)
      // Show error to user
      alert(`Error loading posts: ${error.message}`)
    }

    setPosts(data || [])
    setLoading(false)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
    } catch {
      return 'Invalid date'
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Posts</h1>
        <Link
          href="/write"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Create new
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-gray-200 mb-6">
        {(['published', 'scheduled', 'draft'] as PostStatus[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 px-1 font-medium capitalize transition-colors relative ${
              activeTab === tab
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
            <span className={`ml-2 text-sm ${activeTab === tab ? 'text-blue-600' : 'text-gray-400'}`}>
              {counts[tab]}
            </span>
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
        ))}
      </div>

      {/* Posts List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">
            No {activeTab} posts yet
          </p>
          <Link
            href="/write"
            className="text-blue-600 hover:underline"
          >
            Write your first post
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              onClick={() => {
                if (activeTab === 'published' && username) {
                  window.open(`/${username}/${post.slug}`, '_blank')
                } else {
                  router.push(`/write?edit=${post.id}`)
                }
              }}
              className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer group"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900 truncate">
                  {post.title || 'Untitled'}
                </h3>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                  {activeTab === 'published' && (
                    <span>{formatDate(post.published_at)}</span>
                  )}
                  {activeTab === 'scheduled' && (
                    <span>Scheduled for {formatDate(post.scheduled_at)}</span>
                  )}
                  {activeTab === 'draft' && (
                    <span>Last edited {formatDate(post.updated_at)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => router.push(`/write?edit=${post.id}`)}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Edit"
                >
                  <Edit2 size={18} />
                </button>

                {activeTab === 'published' && username && (
                  <button
                    onClick={() => window.open(`/${username}/${post.slug}`, '_blank')}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    title="View"
                  >
                    <ExternalLink size={18} />
                  </button>
                )}

                <button
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="More options"
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
