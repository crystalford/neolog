'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Pin, Loader2 } from 'lucide-react'

interface PinPostButtonProps {
  postId: string
  isPinned: boolean
  isAuthor: boolean
  onToggle?: (isPinned: boolean) => void
}

export function PinPostButton({ postId, isPinned, isAuthor, onToggle }: PinPostButtonProps) {
  const [loading, setLoading] = useState(false)
  const [pinned, setPinned] = useState(isPinned)
  
  const supabase = createClient()

  if (!isAuthor) return null

  const handleToggle = async () => {
    setLoading(true)
    
    if (pinned) {
      await supabase.rpc('unpin_post', { p_post_id: postId })
    } else {
      await supabase.rpc('pin_post', { p_post_id: postId })
    }
    
    setPinned(!pinned)
    onToggle?.(!pinned)
    setLoading(false)
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
        pinned
          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)]'
      }`}
      title={pinned ? 'Unpin from profile' : 'Pin to profile'}
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Pin size={14} className={pinned ? 'fill-current' : ''} />
      )}
      {pinned ? 'Pinned' : 'Pin'}
    </button>
  )
}
