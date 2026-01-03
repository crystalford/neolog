'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ThumbsUp, Loader2 } from 'lucide-react'

interface UpvoteButtonProps {
  postId: string
  initialUpvotes?: number
  showCount?: boolean
  className?: string
}

export function UpvoteButton({ 
  postId, 
  initialUpvotes = 0,
  showCount = true,
  className = '' 
}: UpvoteButtonProps) {
  const [upvoted, setUpvoted] = useState(false)
  const [count, setCount] = useState(initialUpvotes)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const supabase = createClient()

  // Check if user has already upvoted
  useEffect(() => {
    checkUpvoteStatus()
  }, [postId])

  const checkUpvoteStatus = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setChecking(false)
      return
    }

    const { data } = await supabase
      .from('post_upvotes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', session.user.id)
      .single()

    setUpvoted(!!data)
    setChecking(false)
  }

  const handleUpvote = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      // Could redirect to login or show modal
      return
    }

    setLoading(true)

    if (upvoted) {
      // Remove upvote
      const { error } = await supabase
        .from('post_upvotes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', session.user.id)

      if (!error) {
        setUpvoted(false)
        setCount(c => c - 1)
      }
    } else {
      // Get current view count for curator scoring
      const { data: stats } = await supabase
        .from('post_stats')
        .select('total_views')
        .eq('post_id', postId)
        .single()

      const viewsAtUpvote = stats?.total_views || 0

      // Add upvote
      const { error } = await supabase
        .from('post_upvotes')
        .insert({
          post_id: postId,
          user_id: session.user.id,
          post_views_at_upvote: viewsAtUpvote,
        })

      if (!error) {
        setUpvoted(true)
        setCount(c => c + 1)
      }
    }

    setLoading(false)
  }

  return (
    <button
      onClick={handleUpvote}
      disabled={loading || checking}
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
        text-sm font-medium transition-all
        ${upvoted 
          ? 'bg-[var(--accent)] text-white' 
          : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)] hover:border-[var(--border-medium)]'
        }
        disabled:opacity-50
        ${className}
      `}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <ThumbsUp size={16} className={upvoted ? 'fill-current' : ''} />
      )}
      {showCount && <span>{count}</span>}
    </button>
  )
}
