'use client'

import { useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UseReadingProgressProps {
  postId: string
  enabled?: boolean
}

export function useReadingProgress({ postId, enabled = true }: UseReadingProgressProps) {
  const supabase = createClient()
  const startTime = useRef(Date.now())
  const lastSave = useRef(0)
  const maxProgress = useRef(0)

  const saveProgress = useCallback(async (progress: number, timeSpent: number) => {
    // Throttle saves to every 5 seconds
    const now = Date.now()
    if (now - lastSave.current < 5000) return
    lastSave.current = now

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // Only save if progress increased
    if (progress <= maxProgress.current) return
    maxProgress.current = progress

    await supabase.rpc('update_reading_progress', {
      p_user_id: session.user.id,
      p_post_id: postId,
      p_progress: progress,
      p_time_spent: timeSpent,
    })
  }, [postId, supabase])

  useEffect(() => {
    if (!enabled) return

    const handleScroll = () => {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      const progress = Math.min(scrollTop / docHeight, 1)
      const timeSpent = Math.floor((Date.now() - startTime.current) / 1000)
      
      saveProgress(progress, timeSpent)
    }

    // Save on page leave
    const handleBeforeUnload = () => {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      const progress = Math.min(scrollTop / docHeight, 1)
      const timeSpent = Math.floor((Date.now() - startTime.current) / 1000)
      
      // Use sendBeacon for reliable delivery on page close
      const { data: { session } } = supabase.auth.getSession() as any
      if (session?.user?.id) {
        navigator.sendBeacon('/api/reading-progress', JSON.stringify({
          userId: session.user.id,
          postId,
          progress,
          timeSpent,
        }))
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Initial save after 3 seconds (user started reading)
    const initialSave = setTimeout(() => {
      saveProgress(0.01, 3)
    }, 3000)

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      clearTimeout(initialSave)
    }
  }, [enabled, postId, saveProgress, supabase])
}
