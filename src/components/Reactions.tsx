'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Flame, Brain, Heart, ThumbsUp, HelpCircle } from 'lucide-react'

const REACTIONS = [
  { key: 'fire', icon: Flame, label: 'Fire', color: '#f97316' },
  { key: 'mind_blown', icon: Brain, label: 'Mind Blown', color: '#8b5cf6' },
  { key: 'love', icon: Heart, label: 'Love', color: '#ec4899' },
  { key: 'clap', icon: ThumbsUp, label: 'Clap', color: '#22c55e' },
  { key: 'thinking', icon: HelpCircle, label: 'Thinking', color: '#3b82f6' },
]

interface ReactionsProps {
  postId: string
}

export function Reactions({ postId }: ReactionsProps) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [userReactions, setUserReactions] = useState<string[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadReactions()
  }, [postId])

  const loadReactions = async () => {
    // Get counts
    const { data: reactionCounts } = await supabase.rpc('get_post_reactions', { p_post_id: postId })
    if (reactionCounts) {
      const c: Record<string, number> = {}
      reactionCounts.forEach((r: any) => { c[r.reaction] = Number(r.count) })
      setCounts(c)
    }

    // Get user's reactions
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data } = await supabase
        .from('post_reactions')
        .select('reaction')
        .eq('post_id', postId)
        .eq('user_id', session.user.id)
      if (data) setUserReactions(data.map(r => r.reaction))
    }
  }

  const toggleReaction = async (reaction: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    setLoading(reaction)
    const hasReaction = userReactions.includes(reaction)

    if (hasReaction) {
      await supabase.from('post_reactions').delete()
        .eq('post_id', postId).eq('user_id', session.user.id).eq('reaction', reaction)
      setUserReactions(prev => prev.filter(r => r !== reaction))
      setCounts(prev => ({ ...prev, [reaction]: (prev[reaction] || 1) - 1 }))
    } else {
      await supabase.from('post_reactions').insert({ post_id: postId, user_id: session.user.id, reaction })
      setUserReactions(prev => [...prev, reaction])
      setCounts(prev => ({ ...prev, [reaction]: (prev[reaction] || 0) + 1 }))
    }
    setLoading(null)
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (total === 0 && userReactions.length === 0) {
    return (
      <div className="flex items-center gap-1">
        {REACTIONS.map(({ key, icon: Icon, color, label }) => (
          <button
            key={key}
            onClick={() => toggleReaction(key)}
            className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors opacity-40 hover:opacity-100"
            title={`React with ${label}`}
            aria-label={`React with ${label}`}
          >
            <Icon size={18} style={{ color }} />
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {REACTIONS.map(({ key, icon: Icon, color }) => {
        const count = counts[key] || 0
        const active = userReactions.includes(key)
        if (count === 0 && !active) return null
        return (
          <button
            key={key}
            onClick={() => toggleReaction(key)}
            disabled={loading === key}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm transition-all ${
              active ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-secondary)]'
            }`}
            aria-label={`${label} reaction`}
            aria-pressed={active}
          >
            <Icon size={16} style={{ color }} className={active ? '' : 'opacity-60'} />
            <span className={active ? 'font-medium' : 'text-[var(--text-tertiary)]'}>{count}</span>
          </button>
        )
      })}
      {REACTIONS.filter(r => !counts[r.key] && !userReactions.includes(r.key)).slice(0, 2).map(({ key, icon: Icon, color, label }) => (
        <button
          key={key}
          onClick={() => toggleReaction(key)}
          className="p-1.5 rounded-full hover:bg-[var(--bg-secondary)] transition-colors opacity-30 hover:opacity-100"
          aria-label={`React with ${label}`}
        >
          <Icon size={14} style={{ color }} />
        </button>
      ))}
    </div>
  )
}
