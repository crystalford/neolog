'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ReadingProgressProps {
  postId: string
  content: string
}

export function ReadingProgress({ postId, content }: ReadingProgressProps) {
  const [progress, setProgress] = useState(0)
  const [user, setUser] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    loadUser()
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = window.innerHeight
      const documentHeight = document.documentElement.scrollHeight
      const scrollTop = window.scrollY

      const scrollableHeight = documentHeight - windowHeight
      const currentProgress = scrollableHeight > 0 ? (scrollTop / scrollableHeight) * 100 : 0

      setProgress(Math.min(100, Math.max(0, currentProgress)))

      // Save progress for logged-in users (debounced)
      if (user && currentProgress > 5) {
        saveProgress(currentProgress)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll() // Initial call

    return () => window.removeEventListener('scroll', handleScroll)
  }, [user, postId])

  const loadUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user || null)
  }

  // Debounced save
  let saveTimeout: NodeJS.Timeout
  const saveProgress = (currentProgress: number) => {
    clearTimeout(saveTimeout)
    saveTimeout = setTimeout(async () => {
      if (!user) return

      const scrollDepth = Math.floor(currentProgress)
      const isCompleted = currentProgress >= 90

      try {
        // Save to reading_progress table
        await supabase.from('reading_progress').upsert({
          user_id: user.id,
          post_id: postId,
          progress_percentage: scrollDepth,
          completed: isCompleted,
          last_read_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,post_id'
        })
      } catch (error) {
        console.error('Error saving reading progress:', error)
      }
    }, 1000)
  }

  return (
    <>
      {/* Progress bar */}
      <div
        className="fixed top-0 left-0 right-0 h-1 bg-[var(--accent)] z-50 origin-left transition-transform"
        style={{
          transform: `scaleX(${progress / 100})`,
        }}
      />

      {/* Floating progress indicator */}
      <div className="fixed bottom-8 right-8 z-40 hidden lg:block">
        <div className="relative w-16 h-16">
          {/* Background circle */}
          <svg className="w-16 h-16 transform -rotate-90">
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="var(--border-light)"
              strokeWidth="4"
              fill="none"
            />
            {/* Progress circle */}
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="var(--accent)"
              strokeWidth="4"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 28}`}
              strokeDashoffset={`${2 * Math.PI * 28 * (1 - progress / 100)}`}
              className="transition-all duration-300"
            />
          </svg>

          {/* Percentage text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-[var(--text-primary)]">
              {Math.round(progress)}%
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
