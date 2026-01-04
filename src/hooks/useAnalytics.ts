'use client'

import { useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UseAnalyticsOptions {
  postId: string
  contentRef: React.RefObject<HTMLElement>
}

// Generate a session ID for anonymous tracking
function getSessionId(): string {
  const key = 'neolog_session_id'
  let sessionId = sessionStorage.getItem(key)
  if (!sessionId) {
    sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`
    sessionStorage.setItem(key, sessionId)
  }
  return sessionId
}

// Detect device type
function getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
  const ua = navigator.userAgent
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet'
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return 'mobile'
  }
  return 'desktop'
}

// Get referrer domain
function getReferrerDomain(): string | null {
  if (!document.referrer) return null
  try {
    const url = new URL(document.referrer)
    return url.hostname
  } catch {
    return null
  }
}

export function useAnalytics({ postId, contentRef }: UseAnalyticsOptions) {
  const supabase = createClient()
  const viewIdRef = useRef<string | null>(null)
  const startTimeRef = useRef<number>(Date.now())
  const maxScrollRef = useRef<number>(0)
  const lastProgressUpdateRef = useRef<number>(0)
  const isTrackingRef = useRef<boolean>(false)
  const trackedStartRef = useRef<boolean>(false)

  const trackExternal = useCallback(async (event: string, properties: Record<string, any> = {}) => {
    try {
      await fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          event,
          sessionId: getSessionId(),
          properties,
        }),
      })
    } catch {
      // Ignore analytics failures
    }
  }, [postId])

  // Create view record on mount
  useEffect(() => {
    if (isTrackingRef.current) return
    isTrackingRef.current = true

    const createView = async () => {
      const sessionId = getSessionId()
      
      // Check if we already have a view for this session/post
      const { data: existingView } = await supabase
        .from('post_views')
        .select('id')
        .eq('post_id', postId)
        .eq('session_id', sessionId)
        .single()

      if (existingView) {
        viewIdRef.current = existingView.id
        if (!trackedStartRef.current) {
          trackedStartRef.current = true
          trackExternal('post_view_start', {
            referrer: document.referrer || null,
            referrer_domain: getReferrerDomain(),
            device_type: getDeviceType(),
          })
        }
        return
      }

      // Get current user if logged in
      const { data: { session } } = await supabase.auth.getSession()

      const { data, error } = await supabase
        .from('post_views')
        .insert({
          post_id: postId,
          viewer_id: session?.user?.id || null,
          session_id: sessionId,
          device_type: getDeviceType(),
          referrer: document.referrer || null,
          referrer_domain: getReferrerDomain(),
        })
        .select('id')
        .single()

      if (!error && data) {
        viewIdRef.current = data.id
      }

      if (!trackedStartRef.current) {
        trackedStartRef.current = true
        trackExternal('post_view_start', {
          referrer: document.referrer || null,
          referrer_domain: getReferrerDomain(),
          device_type: getDeviceType(),
        })
      }
    }

    createView()
    startTimeRef.current = Date.now()
  }, [postId])

  // Track scroll depth
  const handleScroll = useCallback(() => {
    if (!contentRef.current) return

    const element = contentRef.current
    const rect = element.getBoundingClientRect()
    const windowHeight = window.innerHeight
    const documentHeight = element.scrollHeight
    
    // Calculate how much of the content has been scrolled past
    const scrolled = Math.max(0, -rect.top + windowHeight)
    const scrollPercent = Math.min(100, Math.round((scrolled / documentHeight) * 100))
    
    if (scrollPercent > maxScrollRef.current) {
      maxScrollRef.current = scrollPercent
    }

    // Record progress every 10% or every 30 seconds
    const now = Date.now()
    const timeSinceLastUpdate = now - lastProgressUpdateRef.current
    const shouldUpdate = 
      (scrollPercent % 10 === 0 && scrollPercent > 0) || 
      timeSinceLastUpdate > 30000

    if (shouldUpdate && viewIdRef.current) {
      lastProgressUpdateRef.current = now
      const timeElapsed = Math.round((now - startTimeRef.current) / 1000)
      
      supabase
        .from('reading_progress')
        .insert({
          view_id: viewIdRef.current,
          scroll_position: scrollPercent,
          time_elapsed: timeElapsed,
        })
        .then(() => {})
    }
  }, [contentRef])

  // Set up scroll listener
  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // Update view on unmount or tab close
  useEffect(() => {
    const updateView = async () => {
      if (!viewIdRef.current) return

      const timeOnPage = Math.round((Date.now() - startTimeRef.current) / 1000)
      const readComplete = maxScrollRef.current >= 90

      await supabase
        .from('post_views')
        .update({
          time_on_page: timeOnPage,
          scroll_depth: maxScrollRef.current,
          read_complete: readComplete,
          ended_at: new Date().toISOString(),
        })
        .eq('id', viewIdRef.current)

      trackExternal('post_view_end', {
        time_on_page: timeOnPage,
        scroll_depth: maxScrollRef.current,
        read_complete: readComplete,
      })
    }

    // Update on visibility change (tab switch)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        updateView()
      }
    }

    // Update on beforeunload
    const handleBeforeUnload = () => {
      updateView()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      updateView()
    }
  }, [])

  // Track specific actions
  const trackShare = useCallback(async () => {
    if (!viewIdRef.current) return
    await supabase
      .from('post_views')
      .update({ shared: true })
      .eq('id', viewIdRef.current)
    trackExternal('post_share')
  }, [supabase, trackExternal])

  const trackHighlight = useCallback(async () => {
    if (!viewIdRef.current) return
    await supabase
      .from('post_views')
      .update({ highlighted: true })
      .eq('id', viewIdRef.current)
    trackExternal('post_highlight')
  }, [supabase, trackExternal])

  return {
    trackShare,
    trackHighlight,
  }
}
