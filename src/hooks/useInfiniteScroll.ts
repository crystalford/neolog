'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface UseInfiniteScrollOptions<T> {
  initialData?: T[]
  pageSize?: number
  fetchFn: (offset: number, limit: number) => Promise<{ data: T[]; hasMore: boolean }>
}

export function useInfiniteScroll<T>({ 
  initialData = [], 
  pageSize = 10,
  fetchFn 
}: UseInfiniteScrollOptions<T>) {
  const [data, setData] = useState<T[]>(initialData)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const loadInitial = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchFn(0, pageSize)
      setData(result.data)
      setHasMore(result.hasMore)
    } catch (err) {
      setError('Failed to load')
    }
    setLoading(false)
  }, [fetchFn, pageSize])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    
    setLoadingMore(true)
    try {
      const result = await fetchFn(data.length, pageSize)
      setData(prev => [...prev, ...result.data])
      setHasMore(result.hasMore)
    } catch (err) {
      setError('Failed to load more')
    }
    setLoadingMore(false)
  }, [data.length, fetchFn, hasMore, loadingMore, pageSize])

  // Set up intersection observer
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore()
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    )

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current)
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [hasMore, loadMore, loadingMore])

  const reset = useCallback(() => {
    setData([])
    setHasMore(true)
    loadInitial()
  }, [loadInitial])

  return {
    data,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMoreRef,
    loadInitial,
    loadMore,
    reset,
  }
}
