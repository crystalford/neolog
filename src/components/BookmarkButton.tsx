'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Bookmark, Loader2 } from 'lucide-react'

interface BookmarkButtonProps {
  postId: string
  className?: string
  size?: 'sm' | 'md'
}

export function BookmarkButton({ postId, className = '', size = 'md' }: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkBookmark()
  }, [postId])

  const checkBookmark = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      setChecking(false)
      return
    }

    const { data } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('post_id', postId)
      .single()

    setBookmarked(!!data)
    setChecking(false)
  }

  const handleToggle = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login')
      return
    }

    setLoading(true)

    const { data: isNowBookmarked } = await supabase
      .rpc('toggle_bookmark', {
        p_user_id: session.user.id,
        p_post_id: postId,
      })

    setBookmarked(isNowBookmarked)
    setLoading(false)
  }

  const iconSize = size === 'sm' ? 16 : 20

  return (
    <button
      onClick={handleToggle}
      disabled={loading || checking}
      className={`flex items-center justify-center transition-colors ${
        bookmarked 
          ? 'text-[var(--accent)]' 
          : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
      } ${className}`}
      title={bookmarked ? 'Remove from saved' : 'Save for later'}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin" />
      ) : (
        <Bookmark 
          size={iconSize} 
          className={bookmarked ? 'fill-current' : ''} 
        />
      )}
    </button>
  )
}
