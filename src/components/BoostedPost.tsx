'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Sparkles } from 'lucide-react'

type BoostedPost = {
  campaign_id: string
  post_id: string
  post_title: string
  post_slug: string
  author_username: string
  author_display_name: string | null
  bid_cents: number
}

interface BoostedPostCardProps {
  viewerTopics?: string[]
  placementType: 'feed_slot' | 'end_of_post' | 'recommended'
  placementId?: string
  className?: string
}

export function BoostedPostCard({ 
  viewerTopics = [], 
  placementType,
  placementId,
  className = '' 
}: BoostedPostCardProps) {
  const [boost, setBoost] = useState<BoostedPost | null>(null)
  const [impressionId, setImpressionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadBoostedPost()
  }, [])

  const loadBoostedPost = async () => {
    // Get matching boost
    const { data: matches } = await supabase.rpc('get_boost_matches', {
      viewer_topics: viewerTopics,
      placement_type_filter: placementType,
      limit_count: 1,
    })

    if (!matches || matches.length === 0) {
      setLoading(false)
      return
    }

    const match = matches[0]
    setBoost(match)

    // Record impression
    const { data: { session } } = await supabase.auth.getSession()
    const sessionId = getOrCreateSessionId()

    const { data: impression } = await supabase.rpc('record_boost_impression', {
      p_campaign_id: match.campaign_id,
      p_placement_id: placementId || null,
      p_viewer_id: session?.user?.id || null,
      p_session_id: sessionId,
    })

    if (impression) {
      setImpressionId(impression)
    }

    setLoading(false)
  }

  const getOrCreateSessionId = () => {
    if (typeof window === 'undefined') return 'ssr'
    
    let sessionId = sessionStorage.getItem('boost_session_id')
    if (!sessionId) {
      sessionId = `bs_${Date.now()}_${Math.random().toString(36).slice(2)}`
      sessionStorage.setItem('boost_session_id', sessionId)
    }
    return sessionId
  }

  const handleClick = async () => {
    if (!impressionId) return

    // Record click
    await supabase.rpc('record_boost_click', {
      p_impression_id: impressionId,
    })
  }

  if (loading || !boost) {
    return null // Don't show anything if no boost available
  }

  return (
    <Link
      href={`/${boost.author_username}/${boost.post_slug}`}
      onClick={handleClick}
      className={`block p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors ${className}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={12} className="text-[var(--accent)]" />
        <span className="text-xs text-[var(--text-tertiary)]">Promoted</span>
      </div>
      
      <h3 className="font-medium mb-1 line-clamp-2">
        {boost.post_title}
      </h3>
      
      <p className="text-sm text-[var(--text-secondary)]">
        by {boost.author_display_name || boost.author_username}
      </p>
    </Link>
  )
}

// Component for end-of-post placement
export function EndOfPostBoost({ 
  viewerTopics = [],
  placementId,
}: { 
  viewerTopics?: string[]
  placementId?: string
}) {
  return (
    <div className="mt-8 pt-8 border-t border-[var(--border-light)]">
      <p className="text-sm text-[var(--text-tertiary)] mb-3">You might also enjoy</p>
      <BoostedPostCard 
        viewerTopics={viewerTopics}
        placementType="end_of_post"
        placementId={placementId}
      />
    </div>
  )
}

// Component for feed slot placement
export function FeedSlotBoost({ 
  viewerTopics = [],
  placementId,
}: { 
  viewerTopics?: string[]
  placementId?: string
}) {
  return (
    <BoostedPostCard 
      viewerTopics={viewerTopics}
      placementType="feed_slot"
      placementId={placementId}
    />
  )
}

// Component for recommended section
export function RecommendedBoost({ 
  viewerTopics = [],
  placementId,
  count = 3,
}: { 
  viewerTopics?: string[]
  placementId?: string
  count?: number
}) {
  const [boosts, setBoosts] = useState<BoostedPost[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadBoosts()
  }, [])

  const loadBoosts = async () => {
    const { data: matches } = await supabase.rpc('get_boost_matches', {
      viewer_topics: viewerTopics,
      placement_type_filter: 'recommended',
      limit_count: count,
    })

    if (matches) {
      setBoosts(matches)
      
      // Record impressions for all
      const { data: { session } } = await supabase.auth.getSession()
      const sessionId = getOrCreateSessionId()

      for (const match of matches) {
        await supabase.rpc('record_boost_impression', {
          p_campaign_id: match.campaign_id,
          p_placement_id: placementId || null,
          p_viewer_id: session?.user?.id || null,
          p_session_id: sessionId,
        })
      }
    }

    setLoading(false)
  }

  const getOrCreateSessionId = () => {
    if (typeof window === 'undefined') return 'ssr'
    
    let sessionId = sessionStorage.getItem('boost_session_id')
    if (!sessionId) {
      sessionId = `bs_${Date.now()}_${Math.random().toString(36).slice(2)}`
      sessionStorage.setItem('boost_session_id', sessionId)
    }
    return sessionId
  }

  if (loading || boosts.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--text-tertiary)] flex items-center gap-2">
        <Sparkles size={12} className="text-[var(--accent)]" />
        Promoted
      </p>
      {boosts.map((boost) => (
        <Link
          key={boost.campaign_id}
          href={`/${boost.author_username}/${boost.post_slug}`}
          className="block p-3 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          <h4 className="font-medium text-sm line-clamp-2 mb-1">
            {boost.post_title}
          </h4>
          <p className="text-xs text-[var(--text-tertiary)]">
            {boost.author_display_name || boost.author_username}
          </p>
        </Link>
      ))}
    </div>
  )
}
