'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, ChevronLeft, ChevronRight, Check } from 'lucide-react'

interface SeriesNavProps {
  seriesId: string
  currentPostId: string
}

type SeriesPost = {
  id: string
  title: string
  slug: string
  series_order: number
  author_username: string
}

export function SeriesNav({ seriesId, currentPostId }: SeriesNavProps) {
  const [series, setSeries] = useState<any>(null)
  const [posts, setPosts] = useState<SeriesPost[]>([])
  const [expanded, setExpanded] = useState(false)
  
  const supabase = createClient()

  useEffect(() => {
    loadSeries()
  }, [seriesId])

  const loadSeries = async () => {
    const { data: seriesData } = await supabase
      .from('series')
      .select('*, author:profiles(username)')
      .eq('id', seriesId)
      .single()
    
    if (seriesData) {
      setSeries(seriesData)
      
      const { data: postsData } = await supabase
        .from('posts')
        .select('id, title, slug, series_order, author:profiles(username)')
        .eq('series_id', seriesId)
        .eq('status', 'published')
        .order('series_order', { ascending: true })
      
      if (postsData) {
        setPosts(postsData.map((p: any) => ({ ...p, author_username: p.author.username })))
      }
    }
  }

  if (!series || posts.length === 0) return null

  const currentIndex = posts.findIndex(p => p.id === currentPostId)
  const prevPost = currentIndex > 0 ? posts[currentIndex - 1] : null
  const nextPost = currentIndex < posts.length - 1 ? posts[currentIndex + 1] : null

  return (
    <div className="mb-8 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <BookOpen size={18} className="text-[var(--accent)]" />
          <div className="text-left">
            <p className="text-xs text-[var(--text-tertiary)]">Part of stack</p>
            <p className="font-medium">{series.title}</p>
          </div>
        </div>
        <div className="text-sm text-[var(--text-tertiary)]">
          {currentIndex + 1} of {posts.length}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border-light)] p-2">
          {posts.map((post, i) => (
            <Link
              key={post.id}
              href={`/${post.author_username}/${post.slug}`}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                post.id === currentPostId 
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]' 
                  : 'hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-xs">
                {i + 1}
              </span>
              <span className="flex-1 truncate text-sm">{post.title}</span>
              {post.id === currentPostId && <Check size={14} />}
            </Link>
          ))}
        </div>
      )}

      {(prevPost || nextPost) && (
        <div className="border-t border-[var(--border-light)] p-3 flex gap-2">
          {prevPost ? (
            <Link href={`/${prevPost.author_username}/${prevPost.slug}`}
              className="flex-1 flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors">
              <ChevronLeft size={16} />
              <div className="text-left min-w-0">
                <p className="text-xs text-[var(--text-tertiary)]">Previous</p>
                <p className="text-sm truncate">{prevPost.title}</p>
              </div>
            </Link>
          ) : <div className="flex-1" />}
          {nextPost && (
            <Link href={`/${nextPost.author_username}/${nextPost.slug}`}
              className="flex-1 flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-right">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--text-tertiary)]">Next</p>
                <p className="text-sm truncate">{nextPost.title}</p>
              </div>
              <ChevronRight size={16} />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
