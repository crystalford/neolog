'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { 
  MessageSquare, ChevronUp, Reply, MoreHorizontal,
  Loader2, Send, Trash2, Flag
} from 'lucide-react'

type Comment = {
  id: string
  post_id: string
  author_id: string
  parent_id: string | null
  depth: number
  content: string
  upvote_count: number
  reply_count: number
  created_at: string
  author_username: string
  author_display_name: string | null
  author_avatar_url: string | null
}

interface CommentsProps {
  postId: string
  postAuthorId: string
}

export function Comments({ postId, postAuthorId }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [userUpvotes, setUserUpvotes] = useState<Set<string>>(new Set())
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadComments()
    checkAuth()
  }, [postId])

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user || null)
    
    if (session?.user) {
      // Load user's upvotes
      const { data } = await supabase
        .from('comment_upvotes')
        .select('comment_id')
        .eq('user_id', session.user.id)
      
      if (data) {
        setUserUpvotes(new Set(data.map(u => u.comment_id)))
      }
    }
  }

  const loadComments = async () => {
    const { data } = await supabase
      .rpc('get_post_comments', { p_post_id: postId })
    
    if (data) {
      setComments(data)
    }
    setLoading(false)
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user) {
      router.push('/login')
      return
    }
    
    if (!newComment.trim()) return
    
    setSubmitting(true)
    
    const { data } = await supabase
      .rpc('add_comment', {
        p_post_id: postId,
        p_author_id: user.id,
        p_content: newComment.trim(),
        p_parent_id: null,
      })
    
    if (data) {
      setNewComment('')
      loadComments()
    }
    
    setSubmitting(false)
  }

  const handleSubmitReply = async (parentId: string) => {
    if (!user) {
      router.push('/login')
      return
    }
    
    if (!replyContent.trim()) return
    
    setSubmitting(true)
    
    const { data } = await supabase
      .rpc('add_comment', {
        p_post_id: postId,
        p_author_id: user.id,
        p_content: replyContent.trim(),
        p_parent_id: parentId,
      })
    
    if (data) {
      setReplyContent('')
      setReplyingTo(null)
      loadComments()
    }
    
    setSubmitting(false)
  }

  const handleUpvote = async (commentId: string) => {
    if (!user) {
      router.push('/login')
      return
    }
    
    const { data: upvoted } = await supabase
      .rpc('toggle_comment_upvote', {
        p_comment_id: commentId,
        p_user_id: user.id,
      })
    
    // Optimistic update
    setUserUpvotes(prev => {
      const next = new Set(prev)
      if (upvoted) {
        next.add(commentId)
      } else {
        next.delete(commentId)
      }
      return next
    })
    
    setComments(prev => prev.map(c => 
      c.id === commentId 
        ? { ...c, upvote_count: c.upvote_count + (upvoted ? 1 : -1) }
        : c
    ))
  }

  const handleDelete = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return
    
    await supabase
      .from('comments')
      .update({ status: 'deleted' })
      .eq('id', commentId)
    
    loadComments()
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  // Build threaded structure
  const threadedComments = useCallback(() => {
    const topLevel = comments.filter(c => !c.parent_id)
    const childrenMap = new Map<string, Comment[]>()
    
    comments.forEach(c => {
      if (c.parent_id) {
        const existing = childrenMap.get(c.parent_id) || []
        childrenMap.set(c.parent_id, [...existing, c])
      }
    })
    
    return { topLevel, childrenMap }
  }, [comments])

  const { topLevel, childrenMap } = threadedComments()

  const CommentItem = ({ comment, isReply = false }: { comment: Comment, isReply?: boolean }) => {
    const isAuthor = comment.author_id === postAuthorId
    const isOwn = user?.id === comment.author_id
    const hasUpvoted = userUpvotes.has(comment.id)
    const replies = childrenMap.get(comment.id) || []

    return (
      <div className={`${isReply ? 'ml-8 pl-4 border-l-2 border-[var(--border-light)]' : ''}`}>
        <div className="py-4">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            {comment.author_avatar_url ? (
              <img 
                src={comment.author_avatar_url}
                alt={comment.author_display_name || comment.author_username}
                loading="lazy"
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs text-white font-medium">
                {(comment.author_display_name || comment.author_username)[0].toUpperCase()}
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <Link 
                href={`/${comment.author_username}`}
                className="font-medium hover:text-[var(--accent)]"
              >
                {comment.author_display_name || comment.author_username}
              </Link>
              
              {isAuthor && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-[var(--accent-soft)] text-[var(--accent)]">
                  Author
                </span>
              )}
              
              <span className="text-sm text-[var(--text-tertiary)]">
                {formatDate(comment.created_at)}
              </span>
            </div>
          </div>

          {/* Content */}
          <p className="text-[var(--text-primary)] whitespace-pre-wrap mb-3">
            {comment.content}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => handleUpvote(comment.id)}
              className={`flex items-center gap-1.5 text-sm transition-colors ${
                hasUpvoted 
                  ? 'text-[var(--accent)]' 
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <ChevronUp size={16} className={hasUpvoted ? 'fill-current' : ''} />
              {comment.upvote_count > 0 && comment.upvote_count}
            </button>
            
            <button
              onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
              className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Reply size={14} />
              Reply
            </button>
            
            {isOwn && (
              <button
                onClick={() => handleDelete(comment.id)}
                className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--error)] transition-colors"
                aria-label="Delete comment"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {/* Reply form */}
          {replyingTo === comment.id && (
            <div className="mt-4 flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] flex-shrink-0" />
              <div className="flex-1">
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder={`Reply to ${comment.author_display_name || comment.author_username}...`}
                  className="input min-h-[80px] resize-none"
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={() => {
                      setReplyingTo(null)
                      setReplyContent('')
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSubmitReply(comment.id)}
                    disabled={submitting || !replyContent.trim()}
                    className="btn btn-primary btn-sm"
                  >
                    {submitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <Send size={14} />
                        Reply
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Nested replies */}
        {replies.length > 0 && (
          <div className="space-y-0">
            {replies.map(reply => (
              <CommentItem key={reply.id} comment={reply} isReply />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="border-t border-[var(--border-light)] pt-8 mt-12">
      <h2 className="font-display text-2xl mb-6 flex items-center gap-2">
        <MessageSquare size={24} />
        Comments
        {comments.length > 0 && (
          <span className="text-[var(--text-tertiary)] font-normal">
            ({comments.length})
          </span>
        )}
      </h2>

      {/* New comment form */}
      <form onSubmit={handleSubmitComment} className="mb-8">
        <div className="flex gap-3">
          {user ? (
            <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-medium flex-shrink-0">
              {user.email?.[0].toUpperCase()}
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-[var(--bg-secondary)] flex-shrink-0" />
          )}
          
          <div className="flex-1">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={user ? "Share your thoughts..." : "Sign in to comment"}
              className="input min-h-[100px] resize-none"
              disabled={!user}
            />
            
            <div className="flex justify-end mt-3">
              {user ? (
                <button
                  type="submit"
                  disabled={submitting || !newComment.trim()}
                  className="btn btn-primary"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Posting...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Post Comment
                    </>
                  )}
                </button>
              ) : (
                <Link href="/login" className="btn btn-primary">
                  Sign in to comment
                </Link>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* Comments list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-tertiary)]">
          <MessageSquare size={32} className="mx-auto mb-3 opacity-50" />
          <p>No comments yet. Be the first to share your thoughts!</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-light)]">
          {topLevel.map(comment => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      )}
    </section>
  )
}
