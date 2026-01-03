'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { 
  ArrowLeft, Loader2, GripVertical, Plus, X, Save,
  ChevronUp, ChevronDown
} from 'lucide-react'

type Series = {
  id: string
  title: string
  slug: string
  description: string | null
  cover_image_url: string | null
  is_complete: boolean
  post_count: number
}

type SeriesPost = {
  id: string
  title: string
  slug: string
  series_order: number
  status: string
}

type AvailablePost = {
  id: string
  title: string
  slug: string
  status: string
}

interface Props {
  params: { id: string }
}

export default function SeriesDetailPage({ params }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [series, setSeries] = useState<Series | null>(null)
  const [posts, setPosts] = useState<SeriesPost[]>([])
  const [availablePosts, setAvailablePosts] = useState<AvailablePost[]>([])
  const [showAddPosts, setShowAddPosts] = useState(false)
  
  // Edit fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadSeries()
  }, [params.id])

  const loadSeries = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    // Get series
    const { data: seriesData, error } = await supabase
      .from('series')
      .select('*')
      .eq('id', params.id)
      .eq('author_id', session.user.id)
      .single()

    if (error || !seriesData) {
      router.push('/series')
      return
    }

    setSeries(seriesData)
    setTitle(seriesData.title)
    setDescription(seriesData.description || '')

    // Get posts in series
    const { data: seriesPosts } = await supabase
      .from('posts')
      .select('id, title, slug, series_order, status')
      .eq('series_id', params.id)
      .order('series_order', { ascending: true })

    if (seriesPosts) {
      setPosts(seriesPosts)
    }

    // Get available posts (user's posts not in any series)
    const { data: available } = await supabase
      .from('posts')
      .select('id, title, slug, status')
      .eq('author_id', session.user.id)
      .is('series_id', null)
      .order('created_at', { ascending: false })

    if (available) {
      setAvailablePosts(available)
    }

    setLoading(false)
  }

  const saveChanges = async () => {
    if (!title.trim()) return
    
    setSaving(true)
    await supabase
      .from('series')
      .update({
        title: title.trim(),
        description: description.trim() || null,
      })
      .eq('id', params.id)

    setSaving(false)
  }

  const addPostToSeries = async (postId: string) => {
    const newOrder = posts.length + 1
    
    await supabase
      .from('posts')
      .update({ series_id: params.id, series_order: newOrder })
      .eq('id', postId)

    // Update post count
    await supabase
      .from('series')
      .update({ post_count: newOrder })
      .eq('id', params.id)

    loadSeries()
  }

  const removePostFromSeries = async (postId: string) => {
    await supabase
      .from('posts')
      .update({ series_id: null, series_order: null })
      .eq('id', postId)

    // Update post count and reorder
    const remaining = posts.filter(p => p.id !== postId)
    for (let i = 0; i < remaining.length; i++) {
      await supabase
        .from('posts')
        .update({ series_order: i + 1 })
        .eq('id', remaining[i].id)
    }

    await supabase
      .from('series')
      .update({ post_count: remaining.length })
      .eq('id', params.id)

    loadSeries()
  }

  const movePost = async (postId: string, direction: 'up' | 'down') => {
    const index = posts.findIndex(p => p.id === postId)
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === posts.length - 1) return

    const newIndex = direction === 'up' ? index - 1 : index + 1
    const swapPost = posts[newIndex]

    // Swap orders
    await supabase
      .from('posts')
      .update({ series_order: newIndex + 1 })
      .eq('id', postId)

    await supabase
      .from('posts')
      .update({ series_order: index + 1 })
      .eq('id', swapPost.id)

    loadSeries()
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

  if (!series) return null

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-2xl mx-auto px-6">
          <div className="pt-8 mb-8">
            <Link 
              href="/series" 
              className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mb-4"
            >
              <ArrowLeft size={14} />
              Back to Series
            </Link>
            <h1 className="font-display text-3xl">Edit Series</h1>
          </div>

          {/* Series details */}
          <div className="space-y-6 mb-8 pb-8 border-b border-[var(--border-light)]">
            <div>
              <label className="block text-sm font-medium mb-2">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input"
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input min-h-[80px] resize-none"
                maxLength={500}
              />
            </div>

            <button
              onClick={saveChanges}
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Save Changes
            </button>
          </div>

          {/* Posts in series */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl">Posts in Series</h2>
              <button
                onClick={() => setShowAddPosts(!showAddPosts)}
                className="btn btn-secondary btn-sm"
              >
                <Plus size={14} />
                Add Posts
              </button>
            </div>

            {/* Add posts panel */}
            {showAddPosts && availablePosts.length > 0 && (
              <div className="mb-4 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  Select posts to add to this series:
                </p>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {availablePosts.map(post => (
                    <button
                      key={post.id}
                      onClick={() => addPostToSeries(post.id)}
                      className="w-full flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] text-left"
                    >
                      <span className="font-medium truncate">{post.title}</span>
                      <Plus size={16} className="text-[var(--accent)] flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {posts.length === 0 ? (
              <div className="text-center py-12 rounded-lg bg-[var(--bg-secondary)]">
                <p className="text-[var(--text-secondary)]">No posts in this series yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {posts.map((post, index) => (
                  <div
                    key={post.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                  >
                    <div className="flex flex-col">
                      <button
                        onClick={() => movePost(post.id, 'up')}
                        disabled={index === 0}
                        className="p-1 hover:bg-[var(--bg-tertiary)] rounded disabled:opacity-30"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => movePost(post.id, 'down')}
                        disabled={index === posts.length - 1}
                        className="p-1 hover:bg-[var(--bg-tertiary)] rounded disabled:opacity-30"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>

                    <span className="w-8 h-8 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-sm font-medium text-[var(--accent)]">
                      {index + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{post.title}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {post.status === 'published' ? 'Published' : 'Draft'}
                      </p>
                    </div>

                    <button
                      onClick={() => removePostFromSeries(post.id)}
                      className="p-2 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--error)]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
