'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PostCard } from '@/components/PostCard'
import { PostCardListSkeleton } from '@/components/Skeleton'
import { 
  BookOpen, ArrowLeft, Lock, Globe, Edit2, Trash2, 
  Plus, Loader2 
} from 'lucide-react'

type ReadingList = {
  id: string
  name: string
  description: string | null
  is_public: boolean
  post_count: number
  user_id: string
}

type ListPost = {
  id: string
  post: {
    id: string
    title: string
    slug: string
    excerpt: string | null
    cover_image_url: string | null
    published_at: string
    reading_time_minutes: number | null
    author: {
      id: string
      username: string
      display_name: string | null
      avatar_url: string | null
    }
  }
  added_at: string
}

interface Props {
  params: { id: string }
}

export default function ListDetailPage({ params }: Props) {
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<ReadingList | null>(null)
  const [posts, setPosts] = useState<ListPost[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadList()
  }, [params.id])

  const loadList = async () => {
    const { data: { session } } = await supabase.auth.getSession()

    // Get list
    const { data: listData, error } = await supabase
      .from('reading_lists')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !listData) {
      router.push('/lists')
      return
    }

    // Check if owner or if list is public
    if (!listData.is_public && listData.user_id !== session?.user?.id) {
      router.push('/lists')
      return
    }

    setList(listData)
    setIsOwner(listData.user_id === session?.user?.id)

    // Get posts in list
    const { data: postsData } = await supabase
      .from('reading_list_items')
      .select(`
        id,
        added_at,
        post:posts(
          id, title, slug, excerpt, cover_image_url, published_at, reading_time_minutes,
          author:profiles(id, username, display_name, avatar_url)
        )
      `)
      .eq('list_id', params.id)
      .order('added_at', { ascending: false })

    if (postsData) {
      setPosts(postsData as unknown as ListPost[])
    }

    setLoading(false)
  }

  const removeFromList = async (itemId: string) => {
    setRemoving(itemId)
    await supabase.from('reading_list_items').delete().eq('id', itemId)
    setPosts(posts.filter(p => p.id !== itemId))
    setRemoving(null)
  }

  if (loading) {
    return (
      <main className="px-6 lg:px-12 py-10 max-w-7xl mx-auto">
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <PostCardListSkeleton key={i} />
          ))}
        </div>
      </main>
    )
  }

  if (!list) return null

  return (
    <main className="px-6 lg:px-12 py-10 max-w-7xl mx-auto">
      <div className="mb-8">
            <Link 
              href="/lists" 
              className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mb-4"
            >
              <ArrowLeft size={14} />
              Back to Lists
            </Link>
            
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h1 className="font-display text-3xl">{list.name}</h1>
                  {list.is_public ? (
                    <Globe size={18} className="text-[var(--text-tertiary)]" />
                  ) : (
                    <Lock size={18} className="text-[var(--text-tertiary)]" />
                  )}
                </div>
                {list.description && (
                  <p className="text-[var(--text-secondary)]">{list.description}</p>
                )}
                <p className="text-sm text-[var(--text-tertiary)] mt-2">
                  {list.post_count} post{list.post_count !== 1 ? 's' : ''}
                </p>
              </div>
              
              {isOwner && (
                <Link href={`/lists/${list.id}/edit`} className="btn btn-secondary btn-sm">
                  <Edit2 size={14} />
                  Edit
                </Link>
              )}
            </div>
          </div>

      {posts.length === 0 ? (
            <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <BookOpen size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
              <h2 className="font-display text-xl mb-2">This list is empty</h2>
              <p className="text-[var(--text-secondary)] mb-6">
                {isOwner 
                  ? 'Add posts to this list from any post page'
                  : 'No posts have been added yet'}
              </p>
              {isOwner && (
                <Link href="/explore" className="btn btn-primary">
                  <Plus size={16} />
                  Find Posts
                </Link>
              )}
            </div>
      ) : (
            <div className="space-y-4">
              {posts.map((item) => (
                <div key={item.id} className="relative group">
                  <PostCard 
                    post={{
                      ...item.post,
                      status: 'published',
                    } as any} 
                    variant="list" 
                  />
                  
                  {isOwner && (
                    <button
                      onClick={() => removeFromList(item.id)}
                      disabled={removing === item.id}
                      className="absolute top-4 right-4 p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-light)] opacity-0 group-hover:opacity-100 transition-opacity hover:border-[var(--error)] hover:text-[var(--error)]"
                      title="Remove from list"
                      aria-label="Remove from list"
                    >
                      {removing === item.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
      )}
    </main>
  )
}


