'use client'

import { useReadingProgress } from '@/hooks/useReadingProgress'

interface ReadingTrackerProps {
  postId: string
}

export function ReadingTracker({ postId }: ReadingTrackerProps) {
  useReadingProgress({ postId })
  return null
}
