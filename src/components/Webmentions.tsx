'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MessageCircle, Heart, Repeat, Link2, Bookmark } from 'lucide-react'

interface WebmentionsProps {
  postId: string
}

type Webmention = {
  id: string
  source_url: string
  mention_type: string
  author_name: string | null
  author_url: string | null
  author_avatar: string | null
  content: string | null
  published_at: string | null
}

const mentionIcons: Record<string, any> = {
  reply: MessageCircle,
  like: Heart,
  repost: Repeat,
  mention: Link2,
  bookmark: Bookmark,
}

export function Webmentions({ postId }: WebmentionsProps) {
  const [mentions, setMentions] = useState<Webmention[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadMentions()
  }, [postId])

  const loadMentions = async () => {
    const { data } = await supabase
      .from('webmentions')
      .select('*')
      .eq('post_id', postId)
      .eq('verified', true)
      .order('published_at', { ascending: false })

    if (data) {
      setMentions(data)
    }
    setLoading(false)
  }

  if (loading || mentions.length === 0) return null

  // Group by type
  const likes = mentions.filter(m => m.mention_type === 'like')
  const reposts = mentions.filter(m => m.mention_type === 'repost')
  const replies = mentions.filter(m => m.mention_type === 'reply')
  const others = mentions.filter(m => !['like', 'repost', 'reply'].includes(m.mention_type || ''))

  return (
    <div className="mt-12 pt-8 border-t border-[var(--border-light)]">
      <h3 className="font-display text-lg mb-6 flex items-center gap-2">
        <Link2 size={18} className="text-[var(--accent)]" />
        Webmentions
      </h3>

      {/* Likes & reposts summary */}
      {(likes.length > 0 || reposts.length > 0) && (
        <div className="flex items-center gap-6 mb-6">
          {likes.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {likes.slice(0, 5).map(like => (
                  like.author_avatar ? (
                    <img 
                      key={like.id}
                      src={like.author_avatar} 
                      alt={like.author_name || 'Anonymous'}
                      className="w-6 h-6 rounded-full border-2 border-[var(--bg-primary)]"
                    />
                  ) : (
                    <div 
                      key={like.id}
                      className="w-6 h-6 rounded-full bg-[var(--accent)] border-2 border-[var(--bg-primary)] flex items-center justify-center text-white text-xs"
                    >
                      {(like.author_name || '?')[0].toUpperCase()}
                    </div>
                  )
                ))}
              </div>
              <span className="text-sm text-[var(--text-secondary)]">
                {likes.length} like{likes.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {reposts.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Repeat size={14} />
              {reposts.length} repost{reposts.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <div className="space-y-4">
          {replies.map(reply => (
            <div 
              key={reply.id}
              className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]"
            >
              <div className="flex items-start gap-3">
                {reply.author_avatar ? (
                  <img 
                    src={reply.author_avatar} 
                    alt={reply.author_name || 'Anonymous'}
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-sm">
                    {(reply.author_name || '?')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {reply.author_url ? (
                      <a 
                        href={reply.author_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="font-medium hover:text-[var(--accent)]"
                      >
                        {reply.author_name || 'Anonymous'}
                      </a>
                    ) : (
                      <span className="font-medium">{reply.author_name || 'Anonymous'}</span>
                    )}
                    {reply.published_at && (
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {new Date(reply.published_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {reply.content && (
                    <p className="text-sm text-[var(--text-secondary)]">{reply.content}</p>
                  )}
                  <a 
                    href={reply.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--accent)] hover:underline mt-2 inline-block"
                  >
                    View original  > 
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Other mentions */}
      {others.length > 0 && (
        <div className="mt-4 space-y-2">
          {others.map(mention => {
            const Icon = mentionIcons[mention.mention_type || 'mention'] || Link2
            return (
              <a
                key={mention.id}
                href={mention.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)]"
              >
                <Icon size={14} />
                <span className="truncate">{mention.source_url}</span>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

