'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Ban, VolumeX, MoreHorizontal, Loader2 } from 'lucide-react'

interface BlockUserButtonProps {
  userId: string
  username: string
  onAction?: () => void
}

export function BlockUserButton({ userId, username, onAction }: BlockUserButtonProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [loading, setLoading] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [muted, setMuted] = useState(false)
  
  const supabase = createClient()

  const handleBlock = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    if (blocked) {
      await supabase.from('user_blocks').delete()
        .eq('blocker_id', session.user.id)
        .eq('blocked_id', userId)
      setBlocked(false)
    } else {
      await supabase.from('user_blocks').insert({
        blocker_id: session.user.id,
        blocked_id: userId,
      })
      setBlocked(true)
    }
    
    setLoading(false)
    setShowMenu(false)
    onAction?.()
  }

  const handleMute = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    if (muted) {
      await supabase.from('user_mutes').delete()
        .eq('muter_id', session.user.id)
        .eq('muted_id', userId)
      setMuted(false)
    } else {
      await supabase.from('user_mutes').insert({
        muter_id: session.user.id,
        muted_id: userId,
      })
      setMuted(true)
    }
    
    setLoading(false)
    setShowMenu(false)
    onAction?.()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
        aria-label="User actions"
      >
        <MoreHorizontal size={16} className="text-[var(--text-tertiary)]" />
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-1 w-48 bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-lg shadow-lg z-20 py-1">
            <button
              onClick={handleMute}
              disabled={loading}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors text-left"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <VolumeX size={16} className="text-[var(--text-tertiary)]" />
              )}
              {muted ? 'Unmute' : 'Mute'} @{username}
            </button>
            
            <button
              onClick={handleBlock}
              disabled={loading}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors text-left text-[var(--error)]"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Ban size={16} />
              )}
              {blocked ? 'Unblock' : 'Block'} @{username}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
